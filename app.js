/**
 * ПОШУКОВА СИСТЕМА ВІДДІЛЕНЬ НОВОЇ ПОШТИ ТА УКРПОШТИ
 * Клієнтська логіка: темна тема, автентичний жовтий стиль Укрпошти,
 * чесний лічильник онлайн (1 на localhost), пошук за індексами (47501 тощо) та API.
 */

(function () {
  'use strict';

  // ==========================================================================
  // СТАН ДОДАТКУ (STATE)
  // ==========================================================================
  const state = {
    currentService: 'novaposhta', // 'novaposhta' | 'ukrposhta'
    searchQuery: '',
    currentResults: [],
    displayLimit: 10, // 5 | 10 | 20 | 'all'
    typeFilter: 'all', // 'all' | 'branch' | 'postomat'
    isMapVisible: false,
    leafletMap: null,
    markersGroup: null,
    userLocationMarker: null,
    apiKeyNP: localStorage.getItem('np_api_key') || '',
    hasServerKey: false,
    selectedBranch: null, // Обране користувачем відділення для повної картки
    onlineTabsCount: 1
  };

  // Початкові міста для сітки з 10 популярних запитів (вайрфрейм 2 рядки по 5)
  const DEFAULT_CITIES = [
    { query: 'Київ', count: 48 },
    { query: 'Львів', count: 41 },
    { query: 'Дніпро', count: 35 },
    { query: 'Одеса', count: 31 },
    { query: 'Харків', count: 29 },
    { query: 'Житомир', count: 24 },
    { query: 'Запоріжжя', count: 22 },
    { query: 'Вінниця', count: 19 },
    { query: 'Полтава', count: 18 },
    { query: 'Миколаїв', count: 15 }
  ];

  // ==========================================================================
  // DOM ЕЛЕМЕНТИ
  // ==========================================================================
  const dom = {
    body: document.body,
    btnNovaPoshta: document.getElementById('btnNovaPoshta'),
    btnUkrposhta: document.getElementById('btnUkrposhta'),
    activeServiceTag: document.getElementById('activeServiceTag'),
    
    // Пошук
    searchForm: document.getElementById('searchForm'),
    searchInput: document.getElementById('searchInput'),
    btnClearSearch: document.getElementById('btnClearSearch'),
    btnSearchSubmit: document.getElementById('btnSearchSubmit'),
    btnQuickPostomat: document.getElementById('btnQuickPostomat'),
    autocompleteDropdown: document.getElementById('autocompleteDropdown'),
    
    // Результати
    searchResultsSection: document.getElementById('searchResultsSection'),
    didYouMeanBox: document.getElementById('didYouMeanBox'),
    resultsList: document.getElementById('resultsList'),
    resultsCount: document.getElementById('resultsCount'),
    btnCloseResults: document.getElementById('btnCloseResults'),
    resultsTypeFilters: document.getElementById('resultsTypeFilters'),
    limitSelector: document.getElementById('limitSelector'),

    // Карта
    btnToggleMap: document.getElementById('btnToggleMap'),
    mapBtnText: document.getElementById('mapBtnText'),
    mapSection: document.getElementById('mapSection'),
    mapServiceTitle: document.getElementById('mapServiceTitle'),
    mapMarkersCount: document.getElementById('mapMarkersCount'),
    btnGeoLocate: document.getElementById('btnGeoLocate'),
    btnCloseMap: document.getElementById('btnCloseMap'),

    // Найчастіші запити та історія
    frequentChipsGrid: document.getElementById('frequentChipsGrid'),
    recentHistoryList: document.getElementById('recentHistoryList'),
    btnClearHistory: document.getElementById('btnClearHistory'),

    // Нижні кути
    btnVersionHistory: document.getElementById('btnVersionHistory'),
    versionModal: document.getElementById('versionModal'),
    btnCloseVersionModal: document.getElementById('btnCloseVersionModal'),
    btnDismissVersionModal: document.getElementById('btnDismissVersionModal'),
    onlineUsersCount: document.getElementById('onlineUsersCount'),

    // Налаштування API
    btnApiSettings: document.getElementById('btnApiSettings'),
    apiModal: document.getElementById('apiModal'),
    btnCloseApiModal: document.getElementById('btnCloseApiModal'),
    btnSaveApiSettings: document.getElementById('btnSaveApiSettings'),
    btnTestApiKey: document.getElementById('btnTestApiKey'),
    npApiKeyInput: document.getElementById('npApiKeyInput'),
    apiTestStatus: document.getElementById('apiTestStatus')
  };

  // ==========================================================================
  // 1. ПЕРЕМИКАННЯ СЛУЖБИ (НОВА ПОШТА ЧЕРВОНА / УКРПОШТА ЖОВТА)
  // ==========================================================================
  function switchService(serviceName) {
    if (state.currentService === serviceName) return;

    state.currentService = serviceName;
    dom.body.setAttribute('data-service', serviceName);

    if (serviceName === 'novaposhta') {
      dom.btnNovaPoshta.classList.add('active');
      dom.btnNovaPoshta.setAttribute('aria-selected', 'true');
      dom.btnUkrposhta.classList.remove('active');
      dom.btnUkrposhta.setAttribute('aria-selected', 'false');

      dom.activeServiceTag.textContent = 'Нова пошта';
      dom.searchInput.placeholder = 'Наприклад: 47501, Бережани, Київ, Відділення 1, вул. Хрещатик...';
      dom.mapServiceTitle.textContent = 'Нова пошта';

      // Відновлюємо поштомати для Нової пошти
      if (dom.btnQuickPostomat) dom.btnQuickPostomat.style.display = '';
      if (dom.resultsTypeFilters) {
        const postomatPill = dom.resultsTypeFilters.querySelector('[data-type="postomat"]');
        if (postomatPill) postomatPill.style.display = '';
      }
    } else {
      dom.btnUkrposhta.classList.add('active');
      dom.btnUkrposhta.setAttribute('aria-selected', 'true');
      dom.btnNovaPoshta.classList.remove('active');
      dom.btnNovaPoshta.setAttribute('aria-selected', 'false');

      dom.activeServiceTag.textContent = 'Укрпошта';
      dom.searchInput.placeholder = 'Наприклад: 47501, Бережани, Київ 01001, Львів 79000, вул. Соборна...';
      dom.mapServiceTitle.textContent = 'Укрпошта';

      // Приховуємо кнопку «Поштомат» та фільтр «Поштомати» для Укрпошти (в Укрпошти немає поштоматів)
      if (dom.btnQuickPostomat) dom.btnQuickPostomat.style.display = 'none';
      if (dom.resultsTypeFilters) {
        const postomatPill = dom.resultsTypeFilters.querySelector('[data-type="postomat"]');
        if (postomatPill) postomatPill.style.display = 'none';
      }

      // Скидаємо фільтр типів на 'all'
      state.typeFilter = 'all';
      updateTypeFilterUI();

      // Для Укрпошти за замовчуванням максимум 5 відділень
      state.displayLimit = 5;
      if (dom.limitSelector) {
        dom.limitSelector.querySelectorAll('.limit-btn').forEach(b => {
          if (b.getAttribute('data-limit') === '5') {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
      }
    }

    // Скидаємо пошук на чистий аркуш при перемиканні служби (виправлення багу збереження результатів іншої служби)
    state.searchQuery = '';
    dom.searchInput.value = '';
    dom.btnClearSearch.classList.add('hidden');
    dom.searchResultsSection.classList.add('hidden');
    if (dom.didYouMeanBox) dom.didYouMeanBox.classList.add('hidden');
    state.currentResults = [];
    state.selectedBranch = null;

    if (state.isMapVisible) {
      updateMapMarkers(getAllCurrentServiceBranches());
    }
  }

  // ==========================================================================
  // 2. ГУГЛ-ПОДІБНИЙ ПОШУКОВИЙ ДВИГУН (FUZZY SEARCH, АВТОВИПРАВЛЕННЯ, СИНТЕЗ)
  // ==========================================================================
  function getAllCurrentServiceBranches() {
    if (!window.BRANCHES_DATA) return [];
    return window.BRANCHES_DATA[state.currentService] || [];
  }

  // Координати та базові вулиці міст України для синтезу будь-яких відділень
  const CITY_METRICS = {
    'київ': {
      title: 'Київ',
      lat: 50.4501,
      lng: 30.5234,
      streets: ['вул. Райдужна, 25', 'просп. Академіка Корольова, 12г', 'вул. Велика Васильківська, 45', 'просп. Червоної Калини, 15', 'вул. Хрещатик, 14', 'вул. Борщагівська, 154', 'просп. Берестейський, 89', 'вул. Межигірська, 22', 'вул. Героїв Дніпра, 35', 'просп. Миколи Бажана, 14']
    },
    'івано-франківськ': {
      title: 'Івано-Франківськ',
      lat: 48.9226,
      lng: 24.7111,
      streets: ['вул. Незалежності, 9', 'вул. Максимовича, 8', 'вул. Гетьмана Мазепи, 175а', 'вул. Галицька, 64', 'вул. Вовчинецька, 26', 'вул. Євгена Коновальця, 229', 'вул. Січових Стрільців, 48', 'вул. В\'ячеслава Чорновола, 23']
    },
    'львів': {
      title: 'Львів',
      lat: 49.8397,
      lng: 24.0297,
      streets: ['вул. Городоцька, 355/6', 'пл. Ринок, 28', 'просп. Червоної Калини, 36', 'вул. Стрийська, 108', 'вул. Наукова, 2', 'вул. Зелена, 147', 'просп. Чорновола, 45']
    },
    'дніпро': {
      title: 'Дніпро',
      lat: 48.4647,
      lng: 35.0462,
      streets: ['просп. Дмитра Яворницького, 34', 'вул. Василя Сухомлинського, 61', 'просп. Слобожанський, 17', 'вул. Титова, 18', 'вул. Робоча, 24', 'просп. Богдана Хмельницького, 110']
    },
    'одеса': {
      title: 'Одеса',
      lat: 46.4825,
      lng: 30.7233,
      streets: ['вул. Дерибасівська, 14', 'вул. Базова, 16', 'просп. Шевченка, 4', 'вул. Семена Палія, 93', 'вул. Академіка Корольова, 33', 'Люстдорфська дорога, 55']
    },
    'харків': {
      title: 'Харків',
      lat: 49.9935,
      lng: 36.2304,
      streets: ['вул. Польова, 67', 'просп. Науки, 27', 'вул. Сумська, 10', 'просп. Героїв Харкова, 144', 'вул. Полтавський Шлях, 56', 'вул. Пушкінська, 79']
    },
    'запоріжжя': {
      title: 'Запоріжжя',
      lat: 47.8388,
      lng: 35.1396,
      streets: ['просп. Соборний, 186', 'вул. Брянська, 8', 'вул. Перемоги, 40', 'вул. Чарівна, 155', 'просп. Ювілейний, 22']
    },
    'житомир': {
      title: 'Житомир',
      lat: 50.2546,
      lng: 28.6587,
      streets: ['вул. Гранітна, 16', 'вул. Перемоги, 12', 'вул. Київська, 20', 'вул. Велика Бердичівська, 67', 'вул. Покровська, 48']
    },
    'вінниця': {
      title: 'Вінниця',
      lat: 49.2331,
      lng: 28.4682,
      streets: ['вул. Соборна, 44', 'вул. Якова Шепеля, 1', 'вул. Келецька, 53', 'просп. Коцюбинського, 25', 'вул. Пирогова, 112']
    },
    'полтава': {
      title: 'Полтава',
      lat: 49.5883,
      lng: 34.5514,
      streets: ['вул. Соборності, 46', 'вул. Ветеринарна, 22', 'вул. Європейська, 66', 'вул. Маршала Бірюзова, 26', 'вул. Зіньківська, 6']
    },
    'миколаїв': {
      title: 'Миколаїв',
      lat: 46.9750,
      lng: 31.9946,
      streets: ['вул. Велика Морська, 67', 'просп. Героїв України, 9а', 'просп. Центральний, 74', 'просп. Миру, 22', 'вул. Космонавтів, 65']
    },
    'тернопіль': {
      title: 'Тернопіль',
      lat: 49.5535,
      lng: 25.5948,
      streets: ['вул. Микулинецька, 46', 'вул. Руська, 17', 'вул. Степана Бандери, 72', 'вул. Князя Острозького, 26', 'вул. 15 Квітня, 6']
    },
    'бережани': {
      title: 'Бережани',
      lat: 49.4442,
      lng: 24.9382,
      streets: ['вул. Степана Бандери, 1', 'вул. Тернопільська, 16а', 'вул. Шевченка, 20']
    },
    'обухів': {
      title: 'Обухів',
      lat: 50.1182,
      lng: 30.6341,
      streets: ['вул. Київська, 21', 'вул. Миру, 9а', 'вул. Каштанова, 14', 'вул. Піщана, 3']
    },
    'буча': {
      title: 'Буча',
      lat: 50.5482,
      lng: 30.2214,
      streets: ['вул. Горького, 8', 'вул. Нове Шосе, 14', 'вул. Депутатська, 1']
    },
    'ірпінь': {
      title: 'Ірпінь',
      lat: 50.5212,
      lng: 30.2441,
      streets: ['вул. Центральна, 6', 'вул. Соборна, 105', 'вул. Університетська, 2/1']
    },
    'бориспіль': {
      title: 'Бориспіль',
      lat: 50.3421,
      lng: 30.9542,
      streets: ['вул. Привокзальна, 21', 'вул. Київський Шлях, 76']
    },
    'бровари': {
      title: 'Бровари',
      lat: 50.5182,
      lng: 30.7941,
      streets: ['вул. Київська, 227', 'вул. Героїв України, 12']
    },
    'біла церква': {
      title: 'Біла Церква',
      lat: 49.8012,
      lng: 30.1142,
      streets: ['вул. Фастівська, 23', 'просп. Князя Володимира, 11', 'вул. Леваневського, 59']
    },
    'кривий ріг': {
      title: 'Кривий Ріг',
      lat: 47.9124,
      lng: 33.3982,
      streets: ['вул. Купріна, 123б', 'просп. Миру, 33', 'вул. Лермонтова, 19']
    },
    'коломия': {
      title: 'Коломия',
      lat: 48.5308,
      lng: 25.0401,
      streets: ['вул. Січових Стрільців, 23', 'вул. Мазепи, 12']
    },
    'калуш': {
      title: 'Калуш',
      lat: 49.0435,
      lng: 24.3612,
      streets: ['вул. Дзвонарська, 5', 'вул. Каракая, 24']
    },
    'яремче': {
      title: 'Яремче',
      lat: 48.4478,
      lng: 24.5562,
      streets: ['вул. Свободи, 264', 'вул. Руднєва, 8']
    }
  };

  // Кеш у пам'яті для відділень Нової пошти (швидкодія + збереження завантажених міст)
  const liveWarehousesCache = {
    novaposhta: new Map()
  };

  let activeSearchAbortController = null;

  // Прямий запит до офіційного API Нової пошти (через локальний проксі на localhost або прямий CORS API на хостингу)
  async function queryNovaPoshtaApi(modelName, calledMethod, methodProperties, signal = null) {
    const requestPayload = {
      apiKey: state.apiKeyNP || '',
      modelName: modelName,
      calledMethod: calledMethod,
      methodProperties: methodProperties
    };

    let rawData = null;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // 1. Якщо локальний dev (localhost) — використовуємо серверний проксі server.py
    if (isLocal) {
      try {
        const response = await fetch('/api/novaposhta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload),
          signal: signal
        });
        if (response.ok) {
          rawData = await response.json();
        }
      } catch (e) {
        if (e.name === 'AbortError') return null;
      }
    }

    // 2. Якщо хостинг (GitHub Pages тощо) або локальний проксі не відповів — викликаємо прямий CORS API Нової пошти миттєво!
    if (!rawData || !rawData.success) {
      try {
        const response = await fetch('https://api.novaposhta.ua/v2.0/json/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload),
          signal: signal
        });
        if (response.ok) {
          rawData = await response.json();
        }
      } catch (e) {
        if (e.name === 'AbortError') return null;
        console.warn('Прямий виклик API Нової пошти не вдався:', e);
      }
    }

    if (rawData && rawData.success && Array.isArray(rawData.data)) {
      return rawData.data;
    }
    return null;
  }

  // Отримання повного списку відділень для будь-якого населеного пункту України (з 2-рівневим кешуванням RAM + SessionStorage)
  async function fetchLiveNovaPoshta(cityName, signal = null) {
    if (!cityName) return null;
    let normalizedCity = cityName.trim();
    if (window.SmartSearchEngine) {
      normalizedCity = window.SmartSearchEngine.normalizeLocativeCase(normalizedCity);
      const found = window.SmartSearchEngine.UKRAINE_SETTLEMENTS.find(s =>
        s.name.toLowerCase() === normalizedCity.toLowerCase() ||
        (s.aliases && s.aliases.includes(normalizedCity.toLowerCase()))
      );
      if (found) normalizedCity = found.name;
    }

    const cacheKey = normalizedCity.toLowerCase();
    
    // Рівень 1: Швидкісний RAM Cache (0 ms)
    if (liveWarehousesCache.novaposhta.has(cacheKey)) {
      return liveWarehousesCache.novaposhta.get(cacheKey);
    }

    // Рівень 2: Швидкісний SessionStorage Cache (0 ms, зберігається між оновленнями сторінки)
    try {
      const sessKey = 'np_cache_' + encodeURIComponent(cacheKey);
      const cachedStr = sessionStorage.getItem(sessKey);
      if (cachedStr) {
        const parsedCached = JSON.parse(cachedStr);
        if (Array.isArray(parsedCached) && parsedCached.length > 0) {
          liveWarehousesCache.novaposhta.set(cacheKey, parsedCached);
          return parsedCached;
        }
      }
    } catch (e) {}

    // Крок 1: Отримуємо можливі форми назви населеного пункту (називний відмінок, множина, однина, тощо)
    const candidates = window.SmartSearchEngine && window.SmartSearchEngine.getCandidateCityForms
      ? window.SmartSearchEngine.getCandidateCityForms(normalizedCity)
      : [normalizedCity];

    let rawWarehouses = [];
    let settlements = [];

    // Шукаємо серед адрес/населених пунктів Nova Poshta
    for (const cand of candidates) {
      const sRes = await queryNovaPoshtaApi('Address', 'searchSettlements', {
        CityName: cand,
        Limit: '5'
      }, signal);

      if (sRes && sRes.length > 0 && sRes[0].Addresses && sRes[0].Addresses.length > 0) {
        settlements = sRes[0].Addresses;
        break;
      }
    }

    // Якщо знайшли населені пункти через searchSettlements (особливо для сіл, смт або однойменних міст у різних областях)
    if (settlements.length > 0) {
      // Беремо топ-4 співпадіння (наприклад, однойменні села чи селища у різних областях)
      for (const s of settlements.slice(0, 4)) {
        const cityRef = s.DeliveryCity || s.Ref;
        if (cityRef) {
          const wList = await queryNovaPoshtaApi('AddressGeneral', 'getWarehouses', {
            CityRef: cityRef,
            Limit: '300'
          }, signal);
          if (wList && wList.length > 0) {
            // Збагачуємо інформацією про область та район з settlement якщо вони відсутні
            const enriched = wList.map(w => {
              if (!w.SettlementAreaDescription && s.Area) w.SettlementAreaDescription = s.Area;
              if (!w.SettlementRegionsDescription && s.Region) w.SettlementRegionsDescription = s.Region;
              if (!w.SettlementTypeDescription && s.SettlementTypeCode) {
                w.SettlementTypeDescription = s.SettlementTypeCode === 'м.' ? 'місто' : (s.SettlementTypeCode === 'смт' ? 'селище' : 'село');
              }
              return w;
            });
            rawWarehouses = rawWarehouses.concat(enriched);
          }
        }
      }
    }

    // Якщо через searchSettlements не знайдено, спробуємо прямий виклик getWarehouses за формою міста
    if (!rawWarehouses || rawWarehouses.length === 0) {
      for (const cand of candidates) {
        const directList = await queryNovaPoshtaApi('AddressGeneral', 'getWarehouses', {
          CityName: cand,
          Limit: '300'
        }, signal);
        if (directList && directList.length > 0) {
          rawWarehouses = directList;
          break;
        }
      }
    }

    if (!rawWarehouses || rawWarehouses.length === 0) {
      return null;
    }

    const branches = rawWarehouses.map(item => {
      const totalWeight = parseFloat(item.TotalMaxWeightAllowed) || 0;
      const placeWeight = parseFloat(item.PlaceMaxWeightAllowed) || 0;
      const desc = item.Description || '';
      const isPostomat = item.CategoryOfWarehouse === 'Postomat' || desc.toLowerCase().includes('поштомат');
      const isCargo = totalWeight > 200 || placeWeight > 200 || desc.toLowerCase().includes('вантажне') || item.Number === '1';

      let maxWeight = Math.max(totalWeight, placeWeight);
      if (maxWeight === 0) {
        maxWeight = isCargo ? 1100 : 30;
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
        typeName = 'Поштове';
        typeBadge = `Поштове (до ${maxWeight || 30} кг)`;
        typeClass = 'post';
      }

      let street = '';
      if (desc.includes(':')) {
        street = desc.split(':')[1].trim();
      } else if (item.ShortAddress) {
        street = item.ShortAddress.replace(new RegExp(`^${item.CityDescription || cityName}[,\\s]*`, 'i'), '').trim();
      } else {
        street = desc;
      }

      const branchObj = {
        id: 'np-live-' + item.Ref,
        city: item.CityDescription || normalizedCity || cityName,
        settlementType: item.SettlementTypeDescription || 'місто',
        oblast: item.SettlementAreaDescription || '',
        raion: item.SettlementRegionsDescription || '',
        postalCode: item.PostalCodeUA || '',
        number: item.Number,
        name: desc,
        street: street,
        address: item.ShortAddress || street,
        maxWeight: maxWeight,
        typeName: typeName,
        typeText: typeBadge,
        typeClass: typeClass,
        lat: parseFloat(item.Latitude) || 50.0650,
        lng: parseFloat(item.Longitude) || 31.4450,
        isLiveApi: true
      };
      if (window.SmartSearchEngine && window.SmartSearchEngine.buildNormalizedSearchText) {
        branchObj.normalizedSearchText = window.SmartSearchEngine.buildNormalizedSearchText(branchObj);
      }
      return branchObj;
    });

    liveWarehousesCache.novaposhta.set(cacheKey, branches);
    try {
      const sessKey = 'np_cache_' + encodeURIComponent(cacheKey);
      sessionStorage.setItem(sessKey, JSON.stringify(branches));
    } catch (e) {}

    return branches;
  }

  // Утиліта фокусування поля пошуку з встановленням курсору в самий кінець (після назви міста/слова)
  function focusSearchInputAtEnd(appendSpace = true) {
    if (!dom.searchInput) return;
    if (appendSpace && dom.searchInput.value && !dom.searchInput.value.endsWith(' ')) {
      dom.searchInput.value += ' ';
    }
    dom.btnClearSearch.classList.remove('hidden');
    dom.searchInput.focus();
    const len = dom.searchInput.value.length;
    dom.searchInput.setSelectionRange(len, len);
  }

  async function executeSearch(query, shouldRecordAnalytics = true) {
    const rawQuery = (query || '').trim();
    if (!rawQuery) return;

    // Скасовуємо попередній незавершений запит для миттєвої швидкодії
    if (activeSearchAbortController) {
      activeSearchAbortController.abort();
    }
    activeSearchAbortController = new AbortController();
    const currentSignal = activeSearchAbortController.signal;

    state.searchQuery = rawQuery;
    if (dom.searchInput.value.trim() !== rawQuery) {
      dom.searchInput.value = rawQuery;
    }
    dom.btnClearSearch.classList.remove('hidden');

    const engine = window.SmartSearchEngine;
    const parsed = engine ? engine.parseQuery(rawQuery) : {
      rawQuery,
      cleanQuery: rawQuery.toLowerCase(),
      isLayoutFixed: false,
      targetBranchNumber: null,
      isPostomat: false,
      postalCode: null,
      detectedOblast: null,
      detectedRaion: null,
      detectedStreet: null,
      matchedSettlement: null,
      confidence: 0,
      didYouMeanText: null
    };

    const isNP = state.currentService === 'novaposhta';
    let results = [];
    let allCityBranches = [];
    let didYouMeanText = parsed.didYouMeanText;

    // Скидаємо блокування поштоматів, якщо користувач шукає звичайне відділення або не вказав 'поштомат'
    if (/(?:відділення|відділ|вд|склад)/i.test(rawQuery) || (!/(?:поштомат|почтомат|пм)/i.test(rawQuery) && state.typeFilter === 'postomat')) {
      state.typeFilter = 'all';
      updateTypeFilterUI();
    }

    // 1. УНІВЕРСАЛЬНИЙ ПОШУК ЗА ПЕРЕДНОРМАЛІЗОВАНИМ ЗНАЧЕННЯМ (CI/CD OFFLINE ІНДЕКС)
    // Єдине поле: місто, вулиця та номер відділення (0 мс затримки, нуль навантаження на API)
    const allStaticBranches = getAllCurrentServiceBranches();
    let staticMatches = [];
    if (engine && allStaticBranches.length > 0) {
      staticMatches = engine.filterBranchesByNormalizedSearch(rawQuery, allStaticBranches);
    }

    // Перевіряємо, чи є впевнений збіг у статичній базі
    if (staticMatches.length > 0) {
      if (parsed.targetBranchNumber) {
        // Якщо шукали конкретний номер, перевіряємо, чи є в результатах відділення саме з цим номером
        const hasExactTarget = staticMatches.some(b => b.number && b.number.toString() === parsed.targetBranchNumber.toString());
        if (hasExactTarget) {
          results = staticMatches;
        }
      } else {
        // Пошук за вулицею, містом або аліасом без фіксованого номера
        results = staticMatches;
      }
    }

    // 2. ДИНАМІЧНИЙ ОНЛАЙН API FALLBACK ДЛЯ НОВОЇ ПОШТИ
    // Запускається, якщо відділення відсутнє у статичному CI/CD файлі (наприклад, окремі СМТ або села)
    if (isNP && results.length === 0) {
      let searchCity = parsed.matchedSettlement ? parsed.matchedSettlement.name : '';
      if (!searchCity && parsed.cleanQuery) {
        const candidate = parsed.cleanQuery.split(/[, ]+/)[0];
        if (candidate && candidate.length >= 3 && !/^\d+$/.test(candidate)) {
          searchCity = candidate;
        }
      }

      if (searchCity) {
        const liveData = await fetchLiveNovaPoshta(searchCity, currentSignal);
        if (liveData && liveData.length > 0) {
          allCityBranches = liveData;

          // Збагачуємо живі відділення нормалізованим пошуковим індексом
          if (engine) {
            liveData.forEach(b => {
              if (!b.normalizedSearchText) {
                b.normalizedSearchText = engine.buildNormalizedSearchText(b);
              }
            });
          }

          // Застосовуємо універсальний нормалізований фільтр до відділень цього міста
          const liveFiltered = engine ? engine.filterBranchesByNormalizedSearch(rawQuery, liveData) : [];
          if (liveFiltered.length > 0) {
            results = liveFiltered;
          } else if (parsed.targetBranchNumber) {
            const cityName = parsed.matchedSettlement ? parsed.matchedSettlement.name : searchCity;
            didYouMeanText = `⚠️ Відділення або поштомат №${parsed.targetBranchNumber} у м. ${cityName} не знайдено. Доступні відділення:`;
            results = liveData;
          } else {
            results = liveData;
          }
        }
      }
    }

    // 3. ДОДАТКОВИЙ ФОЛБЕК ДЛЯ СТАТИЧНИХ ДАНИХ (Укрпошта або якщо API не відповіло)
    if (results.length === 0) {
      if (staticMatches.length > 0) {
        results = staticMatches;
      } else if (parsed.matchedSettlement) {
        const sName = parsed.matchedSettlement.name.toLowerCase();
        const cityOnly = allStaticBranches.filter(b => b.city && b.city.toLowerCase() === sName);
        if (cityOnly.length > 0) results = cityOnly;
      }
    }

    state.currentResults = results;
    if (results.length === 1) {
      state.selectedBranch = results[0];
    } else {
      state.selectedBranch = null;
    }
    closeAutocomplete();
    renderSearchResults(results, rawQuery, didYouMeanText);

    // Запис у найчастіші запити та історію
    if (shouldRecordAnalytics) {
      const recordTitle = parsed.matchedSettlement ? parsed.matchedSettlement.name : rawQuery;
      recordFrequentQuery(recordTitle);
      recordSearchHistory(rawQuery, results.length);
    }

    // Оновлення карти: показуємо ВСІ відділення знайденого міста, а шукане відділення виділяємо!
    if (state.isMapVisible && state.leafletMap) {
      let mapBranches = allCityBranches.length > 0 ? allCityBranches : [];
      let targetBranch = results.length === 1 ? results[0] : (results.length > 0 ? results[0] : null);

      if (mapBranches.length === 0 && parsed.matchedSettlement) {
        const allBranches = getAllCurrentServiceBranches();
        const sName = parsed.matchedSettlement.name.toLowerCase();
        mapBranches = allBranches.filter(b => b.city && b.city.toLowerCase() === sName);
      }

      if (mapBranches.length === 0) {
        mapBranches = results.length > 0 ? results : getAllCurrentServiceBranches();
      }

      updateMapMarkers(mapBranches, targetBranch);
      if (targetBranch && targetBranch.lat && targetBranch.lng) {
        state.leafletMap.flyTo([targetBranch.lat, targetBranch.lng], 14, { duration: 1.2 });
      } else if (parsed.matchedSettlement && parsed.matchedSettlement.lat) {
        state.leafletMap.flyTo([parsed.matchedSettlement.lat, parsed.matchedSettlement.lng], 13, { duration: 1.2 });
      }
    }
  }

  // Допоміжний метод: очищення вулиці
  function getCleanStreet(branch) {
    let street = branch.street || '';
    if (!street) {
      if (branch.name && branch.name.includes(':')) {
        street = branch.name.split(':')[1].trim();
      } else {
        street = branch.address || '';
      }
    }
    const city = branch.city || '';
    street = street.replace(new RegExp(`^${city}[,\\s]*`, 'i'), '').trim();
    if (!/^(вул|просп|проспект|пл|площа|бульв|бульвар|урочище|набережна|пров|провулок)/i.test(street)) {
      street = 'вул. ' + street;
    }
    return street;
  }

  // Географічна прив'язка (Район, область) для швидкої звірки з клієнтом
  function formatGeoSub(branch) {
    let oblast = branch.oblast || '';
    let raion = branch.raion || '';
    const city = branch.city || '';

    if ((!oblast || !raion) && window.SmartSearchEngine) {
      const found = window.SmartSearchEngine.UKRAINE_SETTLEMENTS.find(s => s.name.toLowerCase() === city.toLowerCase());
      if (found) {
        if (!oblast) oblast = found.oblast;
        if (!raion) raion = found.raion;
      }
    }

    const oblClean = (oblast || '').replace(/\s*область$/i, '').trim();
    const raionClean = (raion || '').replace(/\s*район$/i, '').trim();

    const parts = [];
    if (raionClean) parts.push(`${raionClean} район`);
    if (oblClean) parts.push(`${oblClean} область`);

    return parts.length > 0 ? parts.join(', ') : 'Україна';
  }

  // Визначення бейджа типу та вагового обмеження
  function getTypeBadgeInfo(branch) {
    if (branch.typeText) {
      let cls = 'post';
      if (branch.type === 'cargo' || branch.typeText.includes('Вантажн') || branch.typeText.includes('1100')) cls = 'cargo';
      else if (branch.type === 'poshtomat' || branch.typeText.includes('Поштомат')) cls = 'poshtomat';
      else if (branch.typeText.includes('до 5 кг') || branch.typeText.includes('до 10 кг')) cls = 'pickup';
      return { label: branch.typeText, cls };
    }

    const type = branch.typeName || '';
    const weight = branch.totalMaxWeightAllowed || branch.maxWeight || '';
    let cls = 'post';

    if (type === 'Вантажне(ий)' || branch.number === '1') {
      cls = 'cargo';
      return { label: 'Вантажне (до 1100 кг)', cls };
    } else if (type === 'Поштомат' || (branch.name && branch.name.includes('Поштомат'))) {
      cls = 'poshtomat';
      return { label: 'Поштомат (до 20 кг)', cls };
    } else {
      cls = 'post';
      return { label: weight ? `Поштове (до ${weight} кг)` : 'Поштове (до 30 кг)', cls };
    }
  }

  // Допоміжна функція: Формування рядка для копіювання в LP-CRM
  // Приклад: «місто Ужгород - Вантажне(ий) №1: вул. Волонтерів, 16»
  // Або: «місто Київ - Поштомат 'Нова Пошта' №1230: вул. Дніпровська, 14»
  function formatLpCrmCopyString(branch) {
    let sType = branch.settlementType || '';
    const city = branch.city || '';

    if (!sType && window.SmartSearchEngine) {
      const found = window.SmartSearchEngine.UKRAINE_SETTLEMENTS.find(s => s.name.toLowerCase() === city.toLowerCase());
      if (found) sType = found.type;
    }
    if (!sType) sType = 'місто';

    const isNP = state.currentService === 'novaposhta';
    const isPostomat = branch.type === 'poshtomat' || (branch.typeText && branch.typeText.includes('Поштомат')) || (branch.typeName && branch.typeName.includes('Поштомат')) || (branch.name && branch.name.includes('Поштомат'));

    let type = branch.typeName;
    if (isPostomat) {
      type = 'Поштомат';
    } else if (!type) {
      if (branch.number === '1') type = 'Вантажне(ий)';
      else type = 'Поштове(ий)';
    }
    if (type === 'Поштове') type = 'Поштове(ий)';
    if (type === 'Вантажне') type = 'Вантажне(ий)';

    const num = branch.number || '1';
    const street = getCleanStreet(branch);

    return `${sType} ${city} - ${type} №${num}: ${street}`;
  }

  // Toast сповіщення про успішне копіювання
  function showToast(message) {
    let toast = document.getElementById('toastNotification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toastNotification';
      toast.className = 'toast-notification';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span>✓</span> <span>${escapeHtml(message)}</span>`;
    toast.classList.remove('hide');

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.add('hide');
    }, 2800);
  }

  function copyTextToClipboard(text, btnElement, successText) {
    if (!navigator.clipboard) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } else {
      navigator.clipboard.writeText(text);
    }

    if (btnElement) {
      const origHtml = btnElement.innerHTML;
      btnElement.classList.add('copied');
      btnElement.innerHTML = `<span>✓</span> <span>${successText || 'Скопійовано!'}</span>`;
      setTimeout(() => {
        btnElement.classList.remove('copied');
        btnElement.innerHTML = origHtml;
      }, 2000);
    }

    showToast(text);
  }

  // Створення повнорозмірної картки відділення (з'являється тільки при виборі конкретної адреси)
  function createFullBranchCard(branch) {
    const card = document.createElement('div');
    card.className = 'branch-card';

    let sType = branch.settlementType || '';
    if (!sType && window.SmartSearchEngine) {
      const found = window.SmartSearchEngine.UKRAINE_SETTLEMENTS.find(s => s.name.toLowerCase() === (branch.city || '').toLowerCase());
      if (found) sType = found.type;
    }
    if (!sType) sType = 'місто';

    const lpCrmCopyText = formatLpCrmCopyString(branch);
    const cleanStreet = getCleanStreet(branch);
    const geoSub = formatGeoSub(branch);
    const typeInfo = getTypeBadgeInfo(branch);
    const isPostomat = branch.type === 'poshtomat' || (branch.typeText && branch.typeText.includes('Поштомат')) || (branch.typeName && branch.typeName.includes('Поштомат')) || (branch.name && branch.name.includes('Поштомат'));

    const renaming = window.SmartSearchEngine
      ? window.SmartSearchEngine.detectRenaming(branch.city, (branch.name || '') + ' ' + (branch.street || branch.address || ''))
      : null;

    let renamingHtml = '';
    if (renaming) {
      renamingHtml = `
        <div class="branch-renamed-note" title="В LP-CRM може використовуватися попередня назва">
          🔄 Раніше: <strong>${escapeHtml(renaming.oldName)}</strong> (в LP-CRM)
        </div>
      `;
    }

    let typeDisplay = branch.typeName;
    if (isPostomat) {
      typeDisplay = 'Поштомат';
    } else if (!typeDisplay) {
      if (branch.number === '1') typeDisplay = 'Вантажне(ий)';
      else typeDisplay = 'Поштове(ий)';
    }
    if (typeDisplay === 'Поштове') typeDisplay = 'Поштове(ий)';
    if (typeDisplay === 'Вантажне') typeDisplay = 'Вантажне(ий)';

    const primaryLineText = `${sType} ${branch.city || ''} - ${typeDisplay} №${branch.number || ''}: ${cleanStreet}`;

    card.innerHTML = `
      <!-- Рядок 1: місто [Місто] - [Тип] №[Номер]: [Вулиця] (одне речення без іконок та крапок) -->
      <div class="card-primary-line" title="${escapeHtml(primaryLineText)}">
        <span class="city-highlight">${escapeHtml(sType)} ${escapeHtml(branch.city || '')}</span>
        <span class="line-sep">-</span>
        <span class="branch-highlight">${escapeHtml(typeDisplay)} №${escapeHtml(branch.number || '')}:</span>
        <span class="street-highlight">${escapeHtml(cleanStreet)}</span>
      </div>

      <!-- Рядок 2: Населений пункт (район, область) -->
      <div class="card-geo-line" title="Населений пункт: ${escapeHtml(sType)} ${escapeHtml(branch.city || '')}${geoSub ? ', ' + escapeHtml(geoSub) : ''}">
        <span class="geo-label">Населений пункт:</span>
        <span class="geo-val">${escapeHtml(sType)} ${escapeHtml(branch.city || '')}${geoSub ? ', ' + escapeHtml(geoSub) : ''}</span>
      </div>

      ${renamingHtml}

      <div class="card-foot">
        <div class="card-foot-meta">
          <span class="weight-pill ${typeInfo.cls}">${escapeHtml(typeInfo.label)}</span>
          <span class="status-pill"><span class="status-dot"></span> Працює</span>
        </div>
        <button class="btn-copy-action" type="button" title="Скопіювати для LP-CRM">
          📋 Скопіювати
        </button>
      </div>
    `;

    const btnCopy = card.querySelector('.btn-copy-action');
    btnCopy.addEventListener('click', () => {
      copyTextToClipboard(lpCrmCopyText, btnCopy, 'Скопійовано!');
    });

    return card;
  }

  function renderSearchResults(branches, query, didYouMeanText) {
    dom.searchResultsSection.classList.remove('hidden');

    // 1. Фільтрація за типом (Всі | Відділення | Поштомати)
    let filtered = branches || [];
    if (state.typeFilter === 'postomat') {
      filtered = filtered.filter(b => b.type === 'poshtomat' || (b.typeText && b.typeText.includes('Поштомат')) || (b.typeName && b.typeName.includes('Поштомат')) || (b.name && b.name.includes('Поштомат')));
    } else if (state.typeFilter === 'branch') {
      filtered = filtered.filter(b => !(b.type === 'poshtomat' || (b.typeText && b.typeText.includes('Поштомат')) || (b.typeName && b.typeName.includes('Поштомат')) || (b.name && b.name.includes('Поштомат'))));
    }

    dom.resultsList.innerHTML = '';

    // Відображення Google-style підказки
    if (didYouMeanText && dom.didYouMeanBox) {
      dom.didYouMeanBox.classList.remove('hidden');
      dom.didYouMeanBox.innerHTML = `
        <span>💡 Можливо, ви мали на увазі:</span>
        <a class="did-you-mean-link" id="linkDidYouMean">${escapeHtml(didYouMeanText)}</a>
      `;

      document.getElementById('linkDidYouMean').addEventListener('click', (e) => {
        e.preventDefault();
        dom.searchInput.value = didYouMeanText + ' ';
        dom.btnClearSearch.classList.remove('hidden');
        executeSearch(didYouMeanText, true);
        focusSearchInputAtEnd(true);
        setTimeout(() => focusSearchInputAtEnd(true), 25);
      });
    } else if (dom.didYouMeanBox) {
      dom.didYouMeanBox.classList.add('hidden');
    }

    if (filtered.length === 0) {
      dom.resultsCount.textContent = '0 відділень';
      dom.resultsList.innerHTML = `
        <div style="padding: 36px 16px; text-align: center; color: var(--text-muted); width: 100%;">
          <div style="font-size: 36px; margin-bottom: 10px;">🔍</div>
          <h4 style="font-weight: 800; color: var(--text-main); font-size: 16px; margin-bottom: 6px;">
            ${state.typeFilter === 'postomat' ? 'Поштоматів' : 'Відділень'} за запитом «${escapeHtml(query || state.searchQuery)}» не знайдено
          </h4>
          <p style="font-size: 13px; max-width: 500px; margin: 0 auto; line-height: 1.5;">
            Спробуйте перемкнути фільтр на «Всі» або уточнити назву міста.
          </p>
        </div>
      `;
      return;
    }

    // РЕЖИМ 1: КОРИСТУВАЧ ОБРАВ КОНКРЕТНЕ ВІДДІЛЕННЯ (або є 1 точний результат)
    // Повну картку показуємо тільки коли вже вибрано конкретну адресу!
    if (state.selectedBranch) {
      dom.resultsCount.textContent = `1 обране відділення`;
      const branch = state.selectedBranch;

      const container = document.createElement('div');
      container.className = 'selected-branch-container';
      container.style.width = '100%';

      let backBtnHtml = '';
      if (filtered.length > 1) {
        backBtnHtml = `
          <button type="button" class="btn-back-to-matches" id="btnBackToMatches">
            <span>←</span>
            <span>Показати всі збіги адреси (${filtered.length})</span>
          </button>
        `;
      }

      container.innerHTML = `
        <div class="selected-branch-header">
          ${backBtnHtml}
          <span class="selected-badge-indicator">✓ Обрана адреса</span>
        </div>
      `;

      const card = createFullBranchCard(branch);
      container.appendChild(card);
      dom.resultsList.appendChild(container);

      if (filtered.length > 1) {
        const btnBack = container.querySelector('#btnBackToMatches');
        if (btnBack) {
          btnBack.addEventListener('click', () => {
            state.selectedBranch = null;
            renderSearchResults(branches, query, didYouMeanText);
          });
        }
      }
      return;
    }

    // РЕЖИМ 2: ПОШУК ПО АДРЕСІ — ПОКАЗУЄМО СУТО ЗБІГИ АДРЕСИ В 1 КОЛОНКУ (як в LP-CRM)
    dom.resultsCount.textContent = `${filtered.length} збігів адреси`;

    let toDisplay = filtered;
    if (state.displayLimit !== 'all') {
      const limitNum = parseInt(state.displayLimit, 10) || 10;
      toDisplay = filtered.slice(0, limitNum);
    }

    toDisplay.forEach(branch => {
      const row = document.createElement('div');
      row.className = 'address-match-row';
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');

      let sType = branch.settlementType || '';
      if (!sType && window.SmartSearchEngine) {
        const found = window.SmartSearchEngine.UKRAINE_SETTLEMENTS.find(s => s.name.toLowerCase() === (branch.city || '').toLowerCase());
        if (found) sType = found.type;
      }
      if (!sType) sType = 'місто';

      const cleanStreet = getCleanStreet(branch);
      const geoSub = formatGeoSub(branch);
      const typeInfo = getTypeBadgeInfo(branch);
      const isPostomat = branch.type === 'poshtomat' || (branch.typeText && branch.typeText.includes('Поштомат')) || (branch.typeName && branch.typeName.includes('Поштомат')) || (branch.name && branch.name.includes('Поштомат'));

      let typeDisplay = branch.typeName;
      if (isPostomat) {
        typeDisplay = 'Поштомат';
      } else if (!typeDisplay) {
        if (branch.number === '1') typeDisplay = 'Вантажне(ий)';
        else typeDisplay = 'Поштове(ий)';
      }
      if (typeDisplay === 'Поштове') typeDisplay = 'Поштове(ий)';
      if (typeDisplay === 'Вантажне') typeDisplay = 'Вантажне(ий)';

      const branchTitle = `${typeDisplay} №${branch.number || ''}: <span class="street-part">${escapeHtml(cleanStreet)}</span>`;
      const locationSub = `${sType} ${branch.city || ''}${geoSub ? ', ' + geoSub : ''}`;

      row.innerHTML = `
        <div class="address-match-left">
          <div class="address-match-icon">${isPostomat ? '📦' : '🏢'}</div>
          <div class="address-match-content">
            <div class="address-match-title">${branchTitle}</div>
            <div class="address-match-sub">${escapeHtml(locationSub)}</div>
          </div>
        </div>
        <div class="address-match-right">
          <span class="weight-pill ${typeInfo.cls}">${escapeHtml(typeInfo.label)}</span>
          <span class="address-match-select-btn">Обрати ➔</span>
        </div>
      `;

      const selectThis = () => {
        state.selectedBranch = branch;
        renderSearchResults(branches, query, didYouMeanText);
        if (state.isMapVisible && state.leafletMap && branch.lat && branch.lng) {
          state.leafletMap.flyTo([branch.lat, branch.lng], 15, { duration: 1.0 });
        }
      };

      row.addEventListener('click', selectThis);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectThis();
        }
      });

      dom.resultsList.appendChild(row);
    });
  }



  // ==========================================================================
  // 3. АНАЛІЗ НАЙЧАСТІШИХ ЗАПИТІВ ДНЯ
  // ==========================================================================
  function getTodayKey() {
    const now = new Date();
    return `freq_queries_${now.getFullYear()}_${now.getMonth() + 1}_${now.getDate()}`;
  }

  function getFrequentQueries() {
    const todayKey = getTodayKey();
    const stored = localStorage.getItem(todayKey);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Помилка парсингу частих запитів', e);
      }
    }
    return DEFAULT_CITIES;
  }

  function saveFrequentQueries(list) {
    const todayKey = getTodayKey();
    localStorage.setItem(todayKey, JSON.stringify(list));
  }

  function recordFrequentQuery(query) {
    const normalized = query.trim();
    if (!normalized || normalized.length < 2) return;

    let list = getFrequentQueries();
    const existingIndex = list.findIndex(item => item.query.toLowerCase() === normalized.toLowerCase());

    if (existingIndex !== -1) {
      list[existingIndex].count += 1;
    } else {
      list.push({ query: normalized, count: 1 });
    }

    list.sort((a, b) => b.count - a.count);
    list = list.slice(0, 10);
    saveFrequentQueries(list);
    renderFrequentChips(list);
  }

  function renderFrequentChips(list) {
    const items = list || getFrequentQueries();
    dom.frequentChipsGrid.innerHTML = '';

    items.forEach(item => {
      const chip = document.createElement('button');
      chip.className = 'query-chip-btn';
      chip.setAttribute('type', 'button');
      chip.innerHTML = `
        <span class="chip-text">${escapeHtml(item.query)}</span>
        <span class="chip-count" title="${item.count} запитів сьогодні">${item.count}</span>
      `;

      chip.addEventListener('click', (e) => {
        e.preventDefault();
        dom.searchInput.value = item.query + ' ';
        dom.btnClearSearch.classList.remove('hidden');
        executeSearch(item.query, true);
        focusSearchInputAtEnd(true);
        setTimeout(() => focusSearchInputAtEnd(true), 25);
      });

      dom.frequentChipsGrid.appendChild(chip);
    });
  }

  // ==========================================================================
  // 4. ІСТОРІЯ ОСТАННІХ ПОШУКІВ ЗА 5 ДНІВ
  // ==========================================================================
  const HISTORY_STORAGE_KEY = 'search_history_v2';
  const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

  function getSearchHistory() {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      const now = Date.now();
      return [
        { query: '47501', service: 'ukrposhta', timestamp: now - 1000 * 60 * 2, count: 1 },
        { query: 'Київ Головпоштамт', service: 'ukrposhta', timestamp: now - 1000 * 60 * 20, count: 3 },
        { query: 'Дніпро Яворницького', service: 'novaposhta', timestamp: now - 1000 * 60 * 60 * 3, count: 2 },
        { query: 'Львів Відділення 1', service: 'novaposhta', timestamp: now - 1000 * 60 * 60 * 24, count: 1 },
        { query: 'Бережани Відділення 1', service: 'novaposhta', timestamp: now - 1000 * 60 * 60 * 48, count: 1 }
      ];
    }

    try {
      const list = JSON.parse(raw);
      const now = Date.now();
      return list.filter(item => now - item.timestamp <= FIVE_DAYS_MS);
    } catch (e) {
      return [];
    }
  }

  function saveSearchHistory(list) {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list));
  }

  function recordSearchHistory(query, resultsCount) {
    const list = getSearchHistory();
    const filtered = list.filter(item => !(item.query.toLowerCase() === query.toLowerCase() && item.service === state.currentService));

    filtered.unshift({
      query: query,
      service: state.currentService,
      timestamp: Date.now(),
      count: resultsCount
    });

    const topFive = filtered.slice(0, 5);
    saveSearchHistory(topFive);
    renderRecentHistory(topFive);
  }

  function formatRelativeTime(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Щойно';
    if (minutes < 60) return `${minutes} хв тому`;
    if (hours < 24) return `${hours} год тому`;
    if (days === 1) return 'Вчора';
    return `${days} дн. тому`;
  }

  function renderRecentHistory(items) {
    const list = items || getSearchHistory();
    dom.recentHistoryList.innerHTML = '';

    if (list.length === 0) {
      dom.recentHistoryList.innerHTML = `
        <div class="history-empty-state">
          Історія пошуків порожня. Виконайте пошук, щоб тут збереглися останні запити за 5 днів.
        </div>
      `;
      return;
    }

    list.slice(0, 5).forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-card-item';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');

      const isNP = item.service === 'novaposhta';
      const badgeClass = isNP ? 'np' : 'up';
      const badgeText = isNP ? 'НП' : 'Укрпошта';

      card.innerHTML = `
        <div class="history-card-left">
          <span class="history-service-badge ${badgeClass}">${badgeText}</span>
          <span class="history-query-text">${escapeHtml(item.query)}</span>
        </div>
        <div class="history-card-right">
          <span class="history-timestamp">${formatRelativeTime(item.timestamp)}</span>
          <span class="history-rerun-icon" title="Повторити пошук">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </span>
        </div>
      `;

      card.addEventListener('click', (e) => {
        e.preventDefault();
        switchService(item.service);
        dom.searchInput.value = item.query + ' ';
        dom.btnClearSearch.classList.remove('hidden');
        executeSearch(item.query, true);
        focusSearchInputAtEnd(true);
        setTimeout(() => focusSearchInputAtEnd(true), 25);
      });

      dom.recentHistoryList.appendChild(card);
    });
  }

  // ==========================================================================
  // 5. ТЕМНА КАРТА LEAFLET (OPENSTREETMAP + DARK MODE CSS)
  // ==========================================================================
  function initMapIfNeeded() {
    if (state.leafletMap) return;

    // Центр України
    state.leafletMap = L.map('branchesMap').setView([48.5, 31.5], 6);

    // Стандартні відкриті тайли OpenStreetMap без обмежень та вотермарок
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(state.leafletMap);

    state.markersGroup = L.layerGroup().addTo(state.leafletMap);
  }

  function toggleMapView() {
    state.isMapVisible = !state.isMapVisible;

    if (state.isMapVisible) {
      dom.mapSection.classList.remove('hidden');
      dom.btnToggleMap.classList.add('active');
      if (dom.mapBtnText) dom.mapBtnText.textContent = 'Сховати карту';
      dom.btnToggleMap.setAttribute('aria-expanded', 'true');
      dom.btnToggleMap.setAttribute('title', 'Сховати карту');
      dom.btnToggleMap.setAttribute('aria-label', 'Сховати карту');

      initMapIfNeeded();
      
      setTimeout(() => {
        state.leafletMap.invalidateSize();
        const allBranches = getAllCurrentServiceBranches();
        let mapBranches = [];
        let targetBranch = state.currentResults.length === 1 ? state.currentResults[0] : (state.currentResults.length > 0 ? state.currentResults[0] : null);

        if (state.searchQuery && window.SmartSearchEngine) {
          const parsed = window.SmartSearchEngine.parseQuery(state.searchQuery);
          if (parsed && parsed.matchedSettlement) {
            const sName = parsed.matchedSettlement.name.toLowerCase();
            mapBranches = allBranches.filter(b => b.city && b.city.toLowerCase() === sName);
          }
        }
        if (mapBranches.length === 0) {
          mapBranches = state.currentResults.length > 0 ? state.currentResults : allBranches;
        }

        updateMapMarkers(mapBranches, targetBranch);
      }, 150);
    } else {
      dom.mapSection.classList.add('hidden');
      dom.btnToggleMap.classList.remove('active');
      if (dom.mapBtnText) dom.mapBtnText.textContent = 'Показати карту';
      dom.btnToggleMap.setAttribute('aria-expanded', 'false');
      dom.btnToggleMap.setAttribute('title', 'Показати карту');
      dom.btnToggleMap.setAttribute('aria-label', 'Показати карту');
    }
  }

  function createCustomPin(isNP, isHighlighted = false) {
    const pinColor = isNP ? (isHighlighted ? '#ff003c' : '#e11d48') : (isHighlighted ? '#ffe600' : '#ffd200');
    const centerColor = isNP ? '#ffffff' : '#0b0f19';
    const width = isHighlighted ? 36 : 28;
    const height = isHighlighted ? 46 : 36;
    const glow = isHighlighted 
      ? `filter: drop-shadow(0 0 10px ${isNP ? 'rgba(255, 0, 60, 0.95)' : 'rgba(255, 230, 0, 0.95)'});` 
      : 'filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));';

    const svgIcon = `
      <div style="${glow} display: flex; align-items: center; justify-content: center;">
        <svg width="${width}" height="${height}" viewBox="0 0 30 38" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 0C6.716 0 0 6.716 0 15C0 26.25 15 38 15 38C15 38 30 26.25 30 15C30 6.716 23.284 0 15 0Z" fill="${pinColor}"/>
          <circle cx="15" cy="15" r="7.5" fill="${centerColor}"/>
          ${isHighlighted ? '<circle cx="15" cy="15" r="4" fill="' + pinColor + '"/>' : ''}
        </svg>
      </div>
    `;
    return L.divIcon({
      html: svgIcon,
      className: isHighlighted ? 'custom-leaflet-marker highlighted-marker' : 'custom-leaflet-marker',
      iconSize: [width, height],
      iconAnchor: [width / 2, height],
      popupAnchor: [0, -height + 4]
    });
  }

  function updateMapMarkers(branches, highlightedBranch = null) {
    if (!state.leafletMap || !state.markersGroup) return;

    state.markersGroup.clearLayers();
    dom.mapMarkersCount.textContent = `(${branches.length} відділень)`;

    if (branches.length === 0) return;

    const isNP = state.currentService === 'novaposhta';
    const regularPin = createCustomPin(isNP, false);
    const highlightedPin = createCustomPin(isNP, true);
    const bounds = [];
    let targetMarker = null;

    branches.forEach(b => {
      if (b.lat && b.lng) {
        const isTarget = highlightedBranch && (
          (highlightedBranch.id && b.id === highlightedBranch.id) ||
          (highlightedBranch.number && b.number && b.number.toString() === highlightedBranch.number.toString() && (b.city || '').toLowerCase() === (highlightedBranch.city || '').toLowerCase())
        );

        const marker = L.marker([b.lat, b.lng], {
          icon: isTarget ? highlightedPin : regularPin,
          zIndexOffset: isTarget ? 1000 : 0
        });

        const gmapsLink = `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`;
        const accentColor = isNP ? '#fb7185' : '#ffd200';
        const btnTextColor = isNP ? '#ffffff' : '#0b0f19';

        const lpCopyStr = formatLpCrmCopyString(b);
        const popupContent = `
          <div style="font-family: var(--font-main); min-width: 240px; padding: 4px;">
            ${isTarget ? '<div style="font-size:11px; font-weight:700; color:' + accentColor + '; text-transform:uppercase; margin-bottom:4px;">⭐ Вибране відділення</div>' : ''}
            <strong style="color: ${accentColor}; font-size: 14.5px; display: block; margin-bottom: 4px;">${escapeHtml(b.name)}</strong>
            <p style="margin: 4px 0; font-size: 12.5px; color: #cbd5e1;">📍 <strong>${escapeHtml(b.city)}</strong>, ${escapeHtml(b.address || b.street)}</p>
            <p style="margin: 4px 0; font-size: 11.5px; color: #94a3b8;">🕒 ${escapeHtml(b.schedule || 'Пн-Пт 08:00-19:00')}</p>
            <div style="margin-top: 10px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <button type="button" class="btn-popup-copy" data-copy="${escapeHtml(lpCopyStr)}">
                📋 Скопіювати
              </button>
              <a href="${gmapsLink}" target="_blank" style="display: inline-block; background: ${accentColor}; color: ${btnTextColor}; padding: 6px 12px; border-radius: 6px; font-size: 12px; text-decoration: none; font-weight: 700;">🚗 Маршрут</a>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent);
        state.markersGroup.addLayer(marker);
        bounds.push([b.lat, b.lng]);

        if (isTarget) {
          targetMarker = marker;
        }
      }
    });

    if (targetMarker) {
      setTimeout(() => {
        targetMarker.openPopup();
      }, 250);
    }

    if (bounds.length > 0) {
      if (highlightedBranch && highlightedBranch.lat && highlightedBranch.lng) {
        state.leafletMap.setView([highlightedBranch.lat, highlightedBranch.lng], 14, { animate: true });
      } else {
        state.leafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    }
  }

  function focusBranchOnMap(branch) {
    if (!state.isMapVisible) {
      toggleMapView();
    }
    setTimeout(() => {
      if (state.leafletMap && branch.lat && branch.lng) {
        const allBranches = getAllCurrentServiceBranches();
        const cityBranches = branch.city 
          ? allBranches.filter(b => b.city && b.city.toLowerCase() === branch.city.toLowerCase())
          : [branch];
        updateMapMarkers(cityBranches.length > 0 ? cityBranches : [branch], branch);
        state.leafletMap.setView([branch.lat, branch.lng], 15, { animate: true });
        dom.mapSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 200);
  }

  function getUserLocation() {
    if (!navigator.geolocation) {
      alert('Геолокація не підтримується вашим браузером');
      return;
    }

    dom.btnGeoLocate.textContent = 'Визначаємо...';

    navigator.geolocation.getCurrentPosition(
      pos => {
        dom.btnGeoLocate.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          Моя геолокація
        `;
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;

        if (!state.leafletMap) initMapIfNeeded();
        if (!state.isMapVisible) toggleMapView();

        if (state.userLocationMarker) {
          state.leafletMap.removeLayer(state.userLocationMarker);
        }

        state.userLocationMarker = L.circleMarker([userLat, userLng], {
          radius: 9,
          fillColor: '#38bdf8',
          color: '#ffffff',
          weight: 3,
          opacity: 1,
          fillOpacity: 0.95
        }).addTo(state.leafletMap).bindPopup('📍 Ви знаходитесь тут').openPopup();

        state.leafletMap.setView([userLat, userLng], 13);
      },
      () => {
        dom.btnGeoLocate.textContent = 'Моя геолокація';
        alert('Не вдалося визначити геолокацію. Перевірте дозволи у браузері.');
      }
    );
  }

  // ==========================================================================
  // 6. ЧЕСНИЙ ЛІЧИЛЬНИК ОНЛАЙН (СИНХРОНІЗАЦІЯ ВКЛАДОК ОПЕРАТОРА)
  // ==========================================================================
  function initHonestOnlineCounter() {
    let currentTabCount = 1;

    try {
      const tabChannel = new BroadcastChannel('postal_search_tabs_channel');

      tabChannel.postMessage({ type: 'tab_opened' });

      tabChannel.onmessage = (event) => {
        if (event.data.type === 'tab_opened') {
          currentTabCount += 1;
          tabChannel.postMessage({ type: 'tab_count_sync', count: currentTabCount });
          updateOnlineBadge(currentTabCount);
        } else if (event.data.type === 'tab_count_sync') {
          currentTabCount = Math.max(currentTabCount, event.data.count);
          updateOnlineBadge(currentTabCount);
        } else if (event.data.type === 'tab_closed') {
          currentTabCount = Math.max(1, currentTabCount - 1);
          updateOnlineBadge(currentTabCount);
        }
      };

      window.addEventListener('beforeunload', () => {
        tabChannel.postMessage({ type: 'tab_closed' });
      });

      updateOnlineBadge(1);
    } catch (e) {
      updateOnlineBadge(1);
    }
  }

  function updateOnlineBadge(count) {
    if (!dom.onlineUsersCount) return;
    dom.onlineUsersCount.textContent = `${count}`;
    dom.onlineUsersCount.title = `Активних вкладок: ${count}`;
  }

  // ==========================================================================
  // 7. ТЕСТУВАННЯ ТА ЗБЕРЕЖЕННЯ API НОВОЇ ПОШТИ
  // ==========================================================================
  async function testNovaPoshtaApiKey(apiKey) {
    if (!apiKey) {
      dom.apiTestStatus.textContent = '⚠️ Будь ласка, введіть ключ перед тестуванням.';
      dom.apiTestStatus.style.color = '#fb7185';
      return;
    }

    dom.apiTestStatus.textContent = '⏳ Перевірка зв\'язку з api.novaposhta.ua...';
    dom.apiTestStatus.style.color = '#38bdf8';

    try {
      const response = await fetch('https://api.novaposhta.ua/v2.0/json/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey,
          modelName: 'Address',
          calledMethod: 'searchSettlements',
          methodProperties: {
            CityName: 'Київ',
            Limit: '1'
          }
        })
      });

      const data = await response.json();
      if (data.success) {
        dom.apiTestStatus.textContent = '✅ Ключ дійсний! Успішне з\'єднання з сервером Нової пошти.';
        dom.apiTestStatus.style.color = '#4ade80';
      } else {
        const errorMsg = data.errors && data.errors.length > 0 ? data.errors[0] : 'Невірний ключ';
        dom.apiTestStatus.textContent = `❌ Помилка API: ${errorMsg}`;
        dom.apiTestStatus.style.color = '#fb7185';
      }
    } catch (err) {
      // Якщо CORS блокує прямий клієнтський fetch, пояснюємо користувачу
      dom.apiTestStatus.innerHTML = `
        <span style="color: #ffd200;">ℹ️ Ключ збережено.</span> У браузері прямі запити до API можуть обмежуватись CORS полісом Нової пошти. Система автоматично використовує його при доступності.
      `;
    }
  }

  // ==========================================================================
  // 8. УТИЛІТИ ТА AUTOCOMPLETE DROPDOWN (LP-CRM STYLE)
  // ==========================================================================
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  let activeAutocompleteIndex = -1;
  let autocompleteItems = [];

  function closeAutocomplete() {
    if (!dom.autocompleteDropdown) return;
    dom.autocompleteDropdown.classList.add('hidden');
    dom.autocompleteDropdown.innerHTML = '';
    activeAutocompleteIndex = -1;
    autocompleteItems = [];
  }

  function highlightMatch(text, query) {
    if (!text || !query) return escapeHtml(text || '');
    const tokens = query.trim().split(/\s+/).filter(t => t.length >= 2);
    if (tokens.length === 0) return escapeHtml(text);
    const pattern = tokens.map(t => escapeRegex(t)).join('|');
    const regex = new RegExp(`(${pattern})`, 'giu');
    return escapeHtml(text).replace(regex, '<span class="hl-match">$1</span>');
  }

  function renderAutocomplete(suggestions, query) {
    if (!dom.autocompleteDropdown) return;
    if (!suggestions || suggestions.length === 0) {
      closeAutocomplete();
      return;
    }

    autocompleteItems = suggestions;
    activeAutocompleteIndex = -1;
    dom.autocompleteDropdown.innerHTML = '';

    suggestions.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'autocomplete-item';
      el.setAttribute('role', 'option');
      el.setAttribute('data-index', idx);

      let iconHtml = '📍';
      let badgeClass = 'badge-city';
      if (item.type === 'postomat') {
        iconHtml = '📦';
        badgeClass = 'badge-postomat';
      } else if (item.type === 'branch') {
        iconHtml = '🏢';
        badgeClass = 'badge-branch';
      } else if (item.type === 'село' || item.type === 'смт' || item.type === 'селище') {
        badgeClass = 'badge-village';
      }

      const highlightedTitle = highlightMatch(item.title, query);

      el.innerHTML = `
        <div class="autocomplete-item-main">
          <div class="autocomplete-icon">${iconHtml}</div>
          <div class="autocomplete-content">
            <span class="autocomplete-title">${highlightedTitle}</span>
            <span class="autocomplete-sub">${escapeHtml(item.subtitle)}</span>
          </div>
        </div>
        <span class="autocomplete-badge ${badgeClass}">${escapeHtml(item.badge || item.type)}</span>
      `;

      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectAutocompleteItem(item);
      });

      dom.autocompleteDropdown.appendChild(el);
    });

    dom.autocompleteDropdown.classList.remove('hidden');
  }

  function selectAutocompleteItem(item) {
    if (!item) return;
    let fill = item.textToFill || item.title;
    const isSettlement = item.type === 'місто' || item.type === 'смт' || item.type === 'село' || item.type === 'селище';
    if (isSettlement && !fill.endsWith(' ')) {
      fill += ' ';
    }
    dom.searchInput.value = fill;
    dom.btnClearSearch.classList.remove('hidden');
    closeAutocomplete();
    executeSearch(fill.trim(), true);
    if (isSettlement) {
      focusSearchInputAtEnd(true);
      setTimeout(() => focusSearchInputAtEnd(true), 25);
    }
  }

  function updateAutocompleteFocus() {
    if (!dom.autocompleteDropdown) return;
    const items = dom.autocompleteDropdown.querySelectorAll('.autocomplete-item');
    items.forEach((item, idx) => {
      if (idx === activeAutocompleteIndex) {
        item.classList.add('focused');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('focused');
      }
    });
  }

  function updateTypeFilterUI() {
    if (!dom.resultsTypeFilters) return;
    dom.resultsTypeFilters.querySelectorAll('.type-pill-btn').forEach(b => {
      if (b.getAttribute('data-type') === state.typeFilter) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
  }

  // ==========================================================================
  // 9. EVENT LISTENERS
  // ==========================================================================
  function initEventListeners() {
    dom.btnNovaPoshta.addEventListener('click', () => switchService('novaposhta'));
    dom.btnUkrposhta.addEventListener('click', () => switchService('ukrposhta'));

    let liveSearchDebounceTimer = null;

    dom.searchForm.addEventListener('submit', e => {
      e.preventDefault();
      clearTimeout(liveSearchDebounceTimer);
      closeAutocomplete();
      executeSearch(dom.searchInput.value, true);
    });

    // Автодоповнення та миттєвий живий пошук при введенні (200мс надшвидкий відгук)
    dom.searchInput.addEventListener('input', () => {
      const val = dom.searchInput.value.trim();
      if (val.length > 0) {
        dom.btnClearSearch.classList.remove('hidden');
      } else {
        dom.btnClearSearch.classList.add('hidden');
        closeAutocomplete();
      }

      if (val.length >= 2 && window.SmartSearchEngine) {
        // Отримуємо кешовані відділення міста (якщо вже завантажувалися у сесії)
        let cityPool = null;
        const candidate = val.split(/[, ]+/)[0].toLowerCase();
        if (candidate && liveWarehousesCache.novaposhta.has(candidate)) {
          cityPool = liveWarehousesCache.novaposhta.get(candidate);
        }
        const suggestions = window.SmartSearchEngine.getAutocompleteSuggestions(val, state.currentService, cityPool);
        renderAutocomplete(suggestions, val);
      } else {
        closeAutocomplete();
      }

      // Живий пошук при введенні номера або запиту (200мс)
      clearTimeout(liveSearchDebounceTimer);
      if (val.length >= 2) {
        liveSearchDebounceTimer = setTimeout(() => {
          executeSearch(val, false);
        }, 200);
      }
    });

    // Навігація клавішами в autocomplete (ArrowUp, ArrowDown, Enter, Esc)
    dom.searchInput.addEventListener('keydown', (e) => {
      if (!dom.autocompleteDropdown || dom.autocompleteDropdown.classList.contains('hidden')) {
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (activeAutocompleteIndex < autocompleteItems.length - 1) {
          activeAutocompleteIndex++;
          updateAutocompleteFocus();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (activeAutocompleteIndex > 0) {
          activeAutocompleteIndex--;
          updateAutocompleteFocus();
        } else if (activeAutocompleteIndex === 0) {
          activeAutocompleteIndex = -1;
          updateAutocompleteFocus();
        }
      } else if (e.key === 'Enter') {
        if (activeAutocompleteIndex >= 0 && activeAutocompleteIndex < autocompleteItems.length) {
          e.preventDefault();
          selectAutocompleteItem(autocompleteItems[activeAutocompleteIndex]);
        }
      } else if (e.key === 'Escape') {
        closeAutocomplete();
      }
    });

    dom.searchInput.addEventListener('blur', () => {
      setTimeout(closeAutocomplete, 220);
    });

    document.addEventListener('click', (e) => {
      if (!dom.searchInput.contains(e.target) && dom.autocompleteDropdown && !dom.autocompleteDropdown.contains(e.target)) {
        closeAutocomplete();
      }
    });

    // Швидкий режим поштоматів (разовий швидкий шорткат вставки слова «поштомат», без блокування фільтра)
    if (dom.btnQuickPostomat) {
      dom.btnQuickPostomat.addEventListener('click', (e) => {
        e.preventDefault();
        let val = dom.searchInput.value.trim();
        if (!val) {
          dom.searchInput.value = 'поштомат ';
        } else if (!/(?:поштомат|почтомат|пм)/i.test(val)) {
          dom.searchInput.value = `${val} поштомат `;
        }
        dom.btnClearSearch.classList.remove('hidden');
        focusSearchInputAtEnd(true);
        setTimeout(() => focusSearchInputAtEnd(true), 25);

        if (val.length > 0) {
          executeSearch(dom.searchInput.value, true);
        } else {
          dom.searchInput.dispatchEvent(new Event('input'));
        }
      });
    }

    // Limit Selector (5 | 10 | 20 | Всі)
    if (dom.limitSelector) {
      dom.limitSelector.addEventListener('click', (e) => {
        const btn = e.target.closest('.limit-btn');
        if (!btn) return;
        const limitVal = btn.getAttribute('data-limit');
        state.displayLimit = limitVal === 'all' ? 'all' : parseInt(limitVal, 10);

        dom.limitSelector.querySelectorAll('.limit-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (state.currentResults.length > 0) {
          renderSearchResults(state.currentResults, state.searchQuery, null);
        }
      });
    }

    // Type Filter Pills (Всі | Відділення | Поштомати)
    if (dom.resultsTypeFilters) {
      dom.resultsTypeFilters.addEventListener('click', (e) => {
        const btn = e.target.closest('.type-pill-btn');
        if (!btn) return;
        const typeVal = btn.getAttribute('data-type');
        state.typeFilter = typeVal;

        updateTypeFilterUI();

        if (state.currentResults.length > 0) {
          renderSearchResults(state.currentResults, state.searchQuery, null);
        }
      });
    }

    dom.btnClearSearch.addEventListener('click', () => {
      dom.searchInput.value = '';
      dom.btnClearSearch.classList.add('hidden');
      dom.searchResultsSection.classList.add('hidden');
      closeAutocomplete();
      state.searchQuery = '';
      state.currentResults = [];
      if (state.isMapVisible) {
        updateMapMarkers(getAllCurrentServiceBranches());
      }
      dom.searchInput.focus();
    });

    dom.btnCloseResults.addEventListener('click', () => {
      dom.searchResultsSection.classList.add('hidden');
    });

    dom.btnToggleMap.addEventListener('click', toggleMapView);
    dom.btnCloseMap.addEventListener('click', toggleMapView);
    dom.btnGeoLocate.addEventListener('click', getUserLocation);

    dom.btnClearHistory.addEventListener('click', () => {
      if (confirm('Очистити збережену історію пошуків?')) {
        saveSearchHistory([]);
        renderRecentHistory([]);
      }
    });

    // Модалка версій
    dom.btnVersionHistory.addEventListener('click', () => {
      dom.versionModal.showModal();
    });
    dom.btnCloseVersionModal.addEventListener('click', () => dom.versionModal.close());
    dom.btnDismissVersionModal.addEventListener('click', () => dom.versionModal.close());
    dom.versionModal.addEventListener('click', e => {
      const rect = dom.versionModal.getBoundingClientRect();
      const isInDialog = (
        rect.top <= e.clientY &&
        e.clientY <= rect.bottom &&
        rect.left <= e.clientX &&
        e.clientX <= rect.right
      );
      if (!isInDialog || e.target === dom.versionModal) {
        dom.versionModal.close();
      }
    });

    // Делегований обробник копіювання з попапів карти
    if (dom.branchesMap) {
      dom.branchesMap.addEventListener('click', e => {
        const copyBtn = e.target.closest('.btn-popup-copy');
        if (copyBtn) {
          const text = copyBtn.getAttribute('data-copy');
          if (text) {
            copyTextToClipboard(text, copyBtn, 'Скопійовано!');
          }
        }
      });
    }

    // Модалка API (якщо присутня у версії з панеллю)
    if (dom.btnApiSettings && dom.apiModal) {
      dom.btnApiSettings.addEventListener('click', () => {
        if (dom.npApiKeyInput) dom.npApiKeyInput.value = state.apiKeyNP;
        dom.apiModal.showModal();
      });
      if (dom.btnCloseApiModal) dom.btnCloseApiModal.addEventListener('click', () => dom.apiModal.close());
      dom.apiModal.addEventListener('click', e => {
        if (e.target === dom.apiModal) dom.apiModal.close();
      });

      if (dom.btnTestApiKey && dom.npApiKeyInput) {
        dom.btnTestApiKey.addEventListener('click', () => {
          testNovaPoshtaApiKey(dom.npApiKeyInput.value.trim());
        });
      }

      if (dom.btnSaveApiSettings && dom.npApiKeyInput) {
        dom.btnSaveApiSettings.addEventListener('click', () => {
          state.apiKeyNP = dom.npApiKeyInput.value.trim();
          localStorage.setItem('np_api_key', state.apiKeyNP);
          dom.apiModal.close();
          alert('Налаштування API успішно збережено!');
        });
      }
    }
  }

  // Перевірка наявності захищеного ключа на бекенді (.env)
  function checkServerApiStatus() {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        if (data && data.hasServerKey) {
          state.hasServerKey = true;
        }
      })
      .catch(() => {
        // Працюємо в автономному режимі з локальною базою даних
      });
  }

  // ==========================================================================
  // ІНІЦІАЛІЗАЦІЯ ДОДАТКУ
  // ==========================================================================
  function init() {
    initEventListeners();
    checkServerApiStatus();
    renderFrequentChips();
    renderRecentHistory();
    initHonestOnlineCounter();

    // Автофокус на поле пошуку для миттєвої роботи оператора без зайвих кліків
    setTimeout(() => {
      if (dom.searchInput) {
        dom.searchInput.focus();
      }
    }, 120);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
