/**
 * CI/CD Pipeline Script: Синхронізація та попередня нормалізація відділень Нової пошти
 * 
 * Викачує відділення з API Нової пошти, формує статичний кеш та генерує для кожного
 * відділення нормалізоване пошукове значення (normalizedSearchText) для миттєвого
 * пошуку за єдиним полем (місто, номер відділення, вулиця).
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.NP_API_KEY || '';
const MAX_PAGES = process.env.SYNC_PAGES ? parseInt(process.env.SYNC_PAGES, 10) : 10; // 10 сторінок по 500 = 5000 відділень за замовчуванням
const PAGE_SIZE = 500;

function queryApi(model, method, props) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      apiKey: API_KEY,
      modelName: model,
      calledMethod: method,
      methodProperties: props
    });

    const req = https.request('https://api.novaposhta.ua/v2.0/json/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function normalizeText(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-zа-яіїєґ0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildNormalizedSearchText(item) {
  const parts = [];

  // Місто та відмінкові форми
  if (item.city) {
    parts.push(item.city);
    const c = item.city.toLowerCase();
    if (c.endsWith('ів')) parts.push(c.slice(0, -2) + 'ові', c.slice(0, -2) + 'єві');
    if (c.endsWith('ці')) parts.push(c.slice(0, -2) + 'цях');
    if (c.endsWith('а')) parts.push(c.slice(0, -1) + 'і', c.slice(0, -1) + 'у');
  }

  // Область і район
  if (item.oblast) {
    parts.push(item.oblast, item.oblast.replace(/ська$/i, ''));
  }
  if (item.raion) {
    parts.push(item.raion, item.raion.replace(/ський$/i, ''));
  }
  if (item.settlementType) {
    parts.push(item.settlementType);
  }

  // Номер та варіації запису відділення
  if (item.number) {
    parts.push(
      'відділення ' + item.number,
      'відділ ' + item.number,
      'вд ' + item.number,
      '№' + item.number,
      '#' + item.number,
      item.number
    );
  }

  // Категорія відділення
  if (item.typeClass === 'poshtomat' || (item.name && item.name.toLowerCase().includes('поштомат'))) {
    parts.push('поштомат', 'почтомат', 'пм');
  } else {
    parts.push('відділення', 'поштове', 'вантажне', 'склад');
  }

  if (item.typeName) parts.push(item.typeName);

  // Вулиця та адреса
  if (item.street) parts.push(item.street);
  if (item.address) parts.push(item.address);
  if (item.name) parts.push(item.name);
  if (item.postalCode) parts.push(item.postalCode);

  return normalizeText(parts.join(' '));
}

function transformWarehouse(w) {
  const totalWeight = parseFloat(w.TotalMaxWeightAllowed) || 0;
  const placeWeight = parseFloat(w.PlaceMaxWeightAllowed) || 0;
  const desc = w.Description || '';
  const isPostomat = w.CategoryOfWarehouse === 'Postomat' || desc.toLowerCase().includes('поштомат');
  const isCargo = totalWeight > 200 || placeWeight > 200 || desc.toLowerCase().includes('вантажне') || w.Number === '1';

  let maxWeight = Math.max(totalWeight, placeWeight);
  if (maxWeight === 0) {
    maxWeight = isCargo ? 1100 : (isPostomat ? 20 : 30);
  }
  const isPickup = maxWeight <= 10 || desc.toLowerCase().includes('приймання-видачі');

  let typeName, typeBadge, typeClass;
  if (isPostomat) {
    typeName = 'Поштомат';
    typeBadge = 'Поштомат (до 20 кг)';
    typeClass = 'poshtomat';
  } else if (isCargo) {
    typeName = 'Вантажне(ий)';
    typeBadge = `Вантажне (до ${maxWeight >= 1000 ? maxWeight : 1100} кг)`;
    typeClass = 'cargo';
  } else if (isPickup) {
    typeName = 'Пункт приймання-видачі';
    typeBadge = `Пункт приймання-видачі (до ${maxWeight || 10} кг)`;
    typeClass = 'pickup';
  } else {
    typeName = 'Поштове(ий)';
    typeBadge = `Поштове (до ${maxWeight || 30} кг)`;
    typeClass = 'post';
  }

  let cleanCity = w.CityDescription || '';
  cleanCity = cleanCity.replace(/\s*\([^)]+\)/g, '').trim();

  let street = '';
  if (desc.includes(':')) {
    street = desc.split(':')[1].trim();
  } else if (w.ShortAddress) {
    street = w.ShortAddress.replace(new RegExp(`^${cleanCity}[,\\s]*`, 'i'), '').trim();
  } else {
    street = desc;
  }
  if (street && !/^(вул|просп|пл|бульв|пров|урочище)/i.test(street)) {
    street = 'вул. ' + street;
  }

  const sType = w.SettlementTypeDescription || 'місто';

  const branch = {
    id: 'np-' + w.Ref,
    city: cleanCity,
    settlementType: sType,
    oblast: w.SettlementAreaDescription || '',
    raion: w.SettlementRegionsDescription || '',
    postalCode: w.PostalCodeUA || '',
    number: String(w.Number),
    name: desc,
    street: street,
    address: w.ShortAddress || street,
    maxWeight: maxWeight,
    typeName: typeName,
    typeText: typeBadge,
    typeClass: typeClass,
    lat: parseFloat(w.Latitude) || 50.4501,
    lng: parseFloat(w.Longitude) || 30.5234
  };

  branch.normalizedSearchText = buildNormalizedSearchText(branch);
  return branch;
}

async function sync() {
  console.log(`[CI/CD Sync] Початок викачування відділень Нової пошти (до ${MAX_PAGES} сторінок по ${PAGE_SIZE})...`);
  const allBranches = [];
  const seenIds = new Set();

  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      console.log(`[CI/CD Sync] Запит сторінки ${page}...`);
      const res = await queryApi('AddressGeneral', 'getWarehouses', {
        Limit: String(PAGE_SIZE),
        Page: String(page)
      });

      if (!res.success || !Array.isArray(res.data) || res.data.length === 0) {
        console.log(`[CI/CD Sync] Отримано порожню сторінку або кінець списку на сторінці ${page}.`);
        break;
      }

      for (const item of res.data) {
        if (!seenIds.has(item.Ref)) {
          seenIds.add(item.Ref);
          allBranches.push(transformWarehouse(item));
        }
      }

      console.log(`[CI/CD Sync] Сторінка ${page}: завантажено ${res.data.length} відділень (Всього: ${allBranches.length})`);
      if (res.data.length < PAGE_SIZE) break;
    } catch (e) {
      console.error(`[CI/CD Sync] Помилка на сторінці ${page}:`, e.message);
      break;
    }
  }

  if (allBranches.length === 0) {
    console.error('[CI/CD Sync] Помилка: не вдалося завантажити жодного відділення. Скасування запису.');
    process.exit(1);
  }

  // Зберігаємо існуючі відділення Укрпошти з data/branches.js
  const branchesPath = path.join(__dirname, '..', 'data', 'branches.js');
  let upBranches = [];
  if (fs.existsSync(branchesPath)) {
    const existingContent = fs.readFileSync(branchesPath, 'utf8');
    const fakeWindow = {};
    try {
      eval(existingContent.replace('window.', 'fakeWindow.'));
      if (fakeWindow.BRANCHES_DATA && Array.isArray(fakeWindow.BRANCHES_DATA.ukrposhta)) {
        upBranches = fakeWindow.BRANCHES_DATA.ukrposhta.map(b => {
          if (!b.normalizedSearchText) {
            b.normalizedSearchText = buildNormalizedSearchText(b);
          }
          return b;
        });
      }
    } catch (e) {
      console.warn('[CI/CD Sync] Попередження: не вдалося прочитати існуючі відділення Укрпошти:', e.message);
    }
  }

  const outputJs = `// Автоматично згенерована статична база відділень Нової пошти та Укрпошти
// Оновлено: ${new Date().toISOString()}
// Кількість відділень: НП=${allBranches.length}, Укрпошта=${upBranches.length}

window.BRANCHES_DATA = {
  novaposhta: ${JSON.stringify(allBranches, null, 2)},
  ukrposhta: ${JSON.stringify(upBranches, null, 2)}
};
`;

  fs.writeFileSync(branchesPath, outputJs, 'utf8');
  console.log(`[CI/CD Sync] Успішно збережено ${allBranches.length} відділень НП та ${upBranches.length} УП у ${branchesPath}!`);

  const jsonPath = path.join(__dirname, '..', 'data', 'branches_registry.json');
  fs.writeFileSync(jsonPath, JSON.stringify({
    updatedAt: new Date().toISOString(),
    totalNovaposhta: allBranches.length,
    totalUkrposhta: upBranches.length,
    novaposhta: allBranches,
    ukrposhta: upBranches
  }, null, 2), 'utf8');
  console.log(`[CI/CD Sync] Збережено резервний JSON у ${jsonPath}!`);
}

sync().catch(err => {
  console.error('[CI/CD Sync] Критична помилка виконання:', err);
  process.exit(1);
});
