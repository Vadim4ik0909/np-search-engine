/**
 * scripts/download_all_warehouses.js
 * 
 * Автономний скрипт для повного вивантаження даних відділень Нової Пошти
 * (відділення, поштомати, вантажні пункти України) через офіційне API (AddressGeneral/getWarehouses).
 * 
 * Зберігає оптимізовані файли:
 * - data/all_warehouses.json
 * - data/all_warehouses.js (window.ALL_WAREHOUSES_DATA)
 * 
 * Дотримується правил:
 * - token-budget-guard
 * - js-memory-perf-optimizer
 * - geo-ukraine-topo-engine
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...rest] = trimmed.split('=');
          const val = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = val;
          }
        }
      }
    } catch (e) {
      console.warn('Помилка завантаження .env:', e.message);
    }
  }
}

loadEnv();

const API_KEY = process.env.NP_API_KEY || process.env.NOVA_POSHTA_API_KEY || '34e68667d9a43b14f086f02c38023642';
const PAGE_SIZE = 1000;
const CONCURRENCY = 4;

function queryApi(model, method, props, retryCount = 3) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      apiKey: API_KEY,
      modelName: model,
      calledMethod: method,
      methodProperties: props
    });

    const attempt = (left) => {
      const req = https.request('https://api.novaposhta.ua/v2.0/json/', {
        method: 'POST',
        timeout: 25000,
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
            if (parsed && parsed.success === false) {
              const errMsg = (parsed.errors && parsed.errors.join(', ')) || 'API Error';
              if (left > 0) {
                setTimeout(() => attempt(left - 1), 1200);
              } else {
                reject(new Error(errMsg));
              }
              return;
            }
            resolve(parsed);
          } catch (err) {
            if (left > 0) {
              setTimeout(() => attempt(left - 1), 1200);
            } else {
              reject(err);
            }
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        if (left > 0) setTimeout(() => attempt(left - 1), 1500);
        else reject(new Error('API request timeout'));
      });

      req.on('error', err => {
        if (left > 0) setTimeout(() => attempt(left - 1), 1500);
        else reject(err);
      });

      req.write(payload);
      req.end();
    };

    attempt(retryCount);
  });
}

function formatSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object') return '';
  const weekdays = schedule.Monday || '';
  const sat = schedule.Saturday || '';
  const sun = schedule.Sunday || '';
  if (!weekdays) return '';
  if (sat === weekdays && sun === weekdays) return `Щодня ${weekdays}`;
  if (sat === weekdays) return `Пн-Сб ${weekdays}, Нд ${sun || 'вихідний'}`;
  return `Пн-Пт ${weekdays}, Сб ${sat || 'вихідний'}, Нд ${sun || 'вихідний'}`;
}

function formatDimensions(dim) {
  if (!dim || typeof dim !== 'object') return '';
  const w = Number(dim.Width) || 0;
  const l = Number(dim.Length) || 0;
  const h = Number(dim.Height) || 0;
  if (!w && !l && !h) return '';
  return `${w}×${l}×${h} см`;
}

function cleanSettlementName(raw) {
  if (!raw) return '';
  return raw.replace(/\s*\([^)]*\)/g, '').trim();
}

async function main() {
  console.log('Початок вивантаження повного реєстру відділень Нової Пошти...');

  // 1. Перший запит для отримання totalCount
  const firstPage = await queryApi('AddressGeneral', 'getWarehouses', {
    Limit: String(PAGE_SIZE),
    Page: '1'
  });

  if (!firstPage || !firstPage.success || !Array.isArray(firstPage.data)) {
    throw new Error('Помилка отримання першої сторінки: ' + (firstPage && firstPage.errors ? firstPage.errors.join(', ') : 'Невідома помилка'));
  }

  const totalCount = Number(firstPage.info && firstPage.info.totalCount) || firstPage.data.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  console.log(`Загальна кількість відділень/поштоматів у системі: ${totalCount} (сторінок: ${totalPages})`);

  const rawWarehouses = [...firstPage.data];

  // 2. Паралельне вивантаження решти сторінок
  const pageNumbers = [];
  for (let p = 2; p <= totalPages; p++) {
    pageNumbers.push(p);
  }

  let downloadedPages = 1;
  const queue = [...pageNumbers];

  async function worker() {
    while (queue.length > 0) {
      const page = queue.shift();
      try {
        const res = await queryApi('AddressGeneral', 'getWarehouses', {
          Limit: String(PAGE_SIZE),
          Page: String(page)
        });
        if (res && res.success && Array.isArray(res.data)) {
          rawWarehouses.push(...res.data);
          downloadedPages++;
          if (downloadedPages % 10 === 0 || downloadedPages === totalPages) {
            process.stdout.write(`  Завантажено сторінок: ${downloadedPages}/${totalPages} (${rawWarehouses.length} записів)\r`);
          }
        }
      } catch (err) {
        console.warn(`\nПомилка завантаження сторінки ${page}: ${err.message}. Повертаємо в чергу...`);
        queue.push(page);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  console.log(`\nУспішно завантажено ${rawWarehouses.length} відділень.`);

  // 3. Нормалізація та оптимізація структури даних
  const optimizedWarehouses = rawWarehouses.map(w => {
    const num = String(w.Number || '').trim();
    const city = cleanSettlementName(w.SettlementDescription || w.CityDescription || '');
    const sType = (w.SettlementTypeDescription || 'місто').trim();
    const oblast = (w.SettlementAreaDescription || '').replace(/\s*область$/i, '').trim();
    const raion = (w.SettlementRegionsDescription || '').replace(/\s*район$/i, '').trim();
    const category = w.CategoryOfWarehouse || '';
    const maxWeight = Number(w.TotalMaxWeightAllowed) || Number(w.PlaceMaxWeightAllowed) || 0;
    const placeMaxWeight = Number(w.PlaceMaxWeightAllowed) || 0;
    const dims = formatDimensions(w.ReceivingLimitationsOnDimensions);
    const schedule = formatSchedule(w.Schedule);
    const lat = Number(w.Latitude) || 0;
    const lng = Number(w.Longitude) || 0;

    return {
      Number: num,
      CityDescription: w.CityDescription || '',
      SettlementDescription: city,
      SettlementType: sType,
      SettlementAreaDescription: oblast,
      SettlementRegionsDescription: raion,
      ShortAddress: w.ShortAddress || '',
      Description: w.Description || '',
      CategoryOfWarehouse: category,
      TotalMaxWeightAllowed: maxWeight,
      PlaceMaxWeightAllowed: placeMaxWeight,
      ReceivingLimitationsOnDimensions: dims,
      Schedule: schedule,
      Phone: w.Phone || '',
      Latitude: lat,
      Longitude: lng
    };
  });

  // 4. Збереження файлів
  const outJsonPath = path.join(__dirname, '..', 'data', 'all_warehouses.json');
  const outJsPath = path.join(__dirname, '..', 'data', 'all_warehouses.js');

  fs.writeFileSync(outJsonPath, JSON.stringify(optimizedWarehouses), 'utf8');
  console.log(`Збережено JSON: ${outJsonPath} (${(fs.statSync(outJsonPath).size / (1024 * 1024)).toFixed(2)} MB)`);

  const jsContent = `window.ALL_WAREHOUSES_DATA = ${JSON.stringify(optimizedWarehouses)};\n`;
  fs.writeFileSync(outJsPath, jsContent, 'utf8');
  console.log(`Збережено JS: ${outJsPath} (${(fs.statSync(outJsPath).size / (1024 * 1024)).toFixed(2)} MB)`);

  console.log('Готово! Вивантаження повного реєстру відділень завершено.');
}

main().catch(err => {
  console.error('Критична помилка виконання download_all_warehouses:', err);
  process.exit(1);
});
