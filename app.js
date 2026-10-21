/**
 * ПОШУКОВА СИСТЕМА ВІДДІЛЕНЬ НОВОЇ ПОШТИ ТА УКРПОШТИ
 * Клієнтська логіка: темна тема, автентичний жовтий стиль Укрпошти,
 * чесний лічильник онлайн (1 на localhost), пошук за індексами (47501 тощо) та API.
 */

(function () {
  'use strict';

  const APP_VERSION = '1.3.2';

  // ==========================================================================
  // СТАН ДОДАТКУ (STATE)
  // ==========================================================================
  const state = {
    theme: 'light', // 'light' | 'dark' (Default: Light / біла)
    currentService: 'novaposhta', // 'novaposhta' | 'ukrposhta'
    searchQuery: '',
    currentResults: [],
    displayLimit: 10, // 5 | 10 | 20 | 'all'
    typeFilter: 'all', // 'all' | 'cargo' | 'branch' | 'postomat'
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
    html: document.documentElement,
    btnThemeToggle: document.getElementById('btnThemeToggle'),
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
  // 0. ТЕМА ОФОРМЛЕННЯ (СВІТЛА / ТЕМНА, LOCALSTORAGE, ДЕФОЛТ: СВІТЛА)
  // ==========================================================================
  const THEME_STORAGE_KEY = 'app_theme';

  function getStoredTheme() {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return stored === 'dark' ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function applyTheme(newTheme, saveToStorage = true) {
    const theme = newTheme === 'dark' ? 'dark' : 'light';
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);

    if (dom.btnThemeToggle) {
      const isDark = theme === 'dark';
      const label = isDark ? 'Увімкнути світлу тему' : 'Увімкнути темну тему';
      dom.btnThemeToggle.setAttribute('aria-label', label);
      dom.btnThemeToggle.setAttribute('title', label);
    }

    if (saveToStorage) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch (e) {
        console.error('Помилка запису теми в localStorage', e);
      }
    }
  }

  function toggleTheme() {
    const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme, true);
  }

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
      applyTypeFiltersVisibility();
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
      applyTypeFiltersVisibility();

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
    renderRecentHistory();

    if (state.isMapVisible) {
      updateMapMarkers(state.currentResults.slice(0, 20));
    }
  }

  // ==========================================================================
  // 2. ГУГЛ-ПОДІБНИЙ ПОШУКОВИЙ ДВИГУН (FUZZY SEARCH, АВТОВИПРАВЛЕННЯ, СИНТЕЗ)
  // ==========================================================================
  function getAllCurrentServiceBranches() {
    if (!window.BRANCHES_DATA) return [];
    return window.BRANCHES_DATA[state.currentService] || [];
  }

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
        const cLower = cand.toLowerCase().trim();
        const validAddresses = sRes[0].Addresses.filter(a => {
          const main = (a.MainDescription || a.Present || '').toLowerCase();
          return main.includes(cLower) || cLower.includes(main);
        });
        if (validAddresses.length > 0) {
          settlements = validAddresses;
          break;
        }
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
      let maxWeight = Math.max(totalWeight, placeWeight);
      const isUnder30 = (maxWeight > 0 && maxWeight <= 30) || /(?:до\s*(?:5|10|15|20|30)\s*кг|приймання-видачі)/i.test(desc);
      const isCargo = !isPostomat && !isUnder30 && (totalWeight >= 1000 || placeWeight >= 1000 || item.CategoryOfWarehouse === 'Cargo' || desc.toLowerCase().includes('вантажне'));

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

  let suppressNextFocusActivation = false;

  // Утиліта фокусування поля пошуку з встановленням курсору в самий кінець (після назви міста/слова)
  function focusSearchInputAtEnd(appendSpace = true) {
    if (!dom.searchInput) return;
    if (appendSpace && dom.searchInput.value && !dom.searchInput.value.endsWith(' ')) {
      dom.searchInput.value += ' ';
    }
    dom.btnClearSearch.classList.remove('hidden');
    suppressNextFocusActivation = true;
    dom.searchInput.focus();
    suppressNextFocusActivation = false;
    const len = dom.searchInput.value.length;
    dom.searchInput.setSelectionRange(len, len);
  }

  async function executeSearch(query, shouldRecordAnalytics = true, isExplicitSubmit = false) {
    try {
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

    // Встановлення відповідного фільтру типів за ключовими словами
    if (/(?:вантажне|вантажний|вантаж)/i.test(rawQuery)) {
      state.typeFilter = 'cargo';
      updateTypeFilterUI();
    } else if (/(?:відділення|відділ|вд|склад)/i.test(rawQuery)) {
      state.typeFilter = 'all';
      updateTypeFilterUI();
    }

    // 1. УНІВЕРСАЛЬНИЙ ПОШУК ЗА ПЕРЕДНОРМАЛІЗОВАНИМ ЗНАЧЕННЯМ (CI/CD OFFLINE ІНДЕКС)
    // Єдине поле: місто, вулиця та номер відділення (0 мс затримки, нуль навантаження на API)
    const allStaticBranches = getAllCurrentServiceBranches();
    let staticMatches = [];
    if (engine && allStaticBranches.length > 0) {
      // Таб-фільтр застосовується до ПОВНОГО пулу, а не до обрізаних результатів пошуку
      const tf = state.typeFilter;
      const tabPred = tf === 'postomat' ? isPostomatBranch : tf === 'cargo' ? isCargoBranch : tf === 'branch' ? isRegularBranch : null;
      const searchPool = tabPred ? allStaticBranches.filter(tabPred) : allStaticBranches;
      staticMatches = engine.filterBranchesByNormalizedSearch(rawQuery, searchPool, tabPred ? 200 : 20);
    }

    // Перевіряємо, чи є впевнений збіг у статичній базі
    if (staticMatches.length > 0) {
      if (parsed.targetBranchNumber) {
        // Якщо шукали конкретний номер, залишаємо відділення саме з цим номером (відсікаючи номери будинків з адреси)
        let exactMatches = staticMatches.filter(b => (b.number && b.number.toString() === parsed.targetBranchNumber.toString()) || (b.postalCode && b.postalCode.toString() === parsed.targetBranchNumber.toString()));

        // ФОЛЛБЕК ДЛЯ УКРПОШТИ:
        // Якщо клієнт шукає населений пункт + номер ("житомир нові білокоровичі 1"),
        // але в Укрпошті номери відділень - це 5-значні індекси (наприклад 11051):
        if (exactMatches.length === 0 && !isNP && staticMatches.length > 0) {
          exactMatches = staticMatches;
        }

        const hasStreetInQuery = Boolean(
          parsed.detectedStreet ||
          (engine && engine.extractFacets && (engine.extractFacets(rawQuery).streetTokens || []).length > 0)
        );

        if (exactMatches.length > 0) {
          results = exactMatches;
          didYouMeanText = null;
        } else {
          const targetNumStr = parsed.targetBranchNumber.toString();
          const prefixMatches = staticMatches.filter(b => b.number && b.number.toString().startsWith(targetNumStr));
          if (prefixMatches.length > 0) {
            results = prefixMatches;
            didYouMeanText = null;
          } else if (hasStreetInQuery && staticMatches.length > 0) {
            // Якщо точного номера немає серед результатів, але вказано слово-вулицю (випадок "145 драгоманов київ"),
            // відображаємо результат скорингового рушія за цією вулицею
            results = staticMatches;
            didYouMeanText = null;
          }
        }
      } else {
        // Пошук за вулицею, містом або аліасом без фіксованого номера
        results = staticMatches;
      }
    }

    // 2. ДИНАМІЧНИЙ ОНЛАЙН API FALLBACK ДЛЯ НОВОЇ ПОШТИ
    // Запускається лише якщо місто взагалі відсутнє у статичному реєстрі (55k+ відділень вже у статичній базі)
    if (isNP && results.length === 0) {
      let searchCity = parsed.matchedSettlement ? parsed.matchedSettlement.name : '';
      if (!searchCity && parsed.cleanQuery) {
        const candidate = parsed.cleanQuery.split(/[, ]+/)[0];
        if (candidate && candidate.length >= 3 && !/^\d+$/.test(candidate)) {
          searchCity = candidate;
        }
      }

      const cityLower = searchCity ? searchCity.toLowerCase() : '';
      const hasCityInStatic = cityLower && allStaticBranches.some(b => b.city && b.city.toLowerCase() === cityLower);

      if (searchCity && !hasCityInStatic) {
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
          } else {
            results = [];
          }
        }
      }
    }

    // 3. ДОДАТКОВИЙ ФОЛБЕК ДЛЯ СТАТИЧНИХ ДАНИХ (Укрпошта або якщо API не відповіло)
    // КАТЕГОРИЧНЕ ПРАВИЛО EMPTY STATE:
    // Якщо в запиті вказано номер відділення/поштомату (parsed.targetBranchNumber), і його не знайдено:
    // Для Нової Пошти КАТЕГОРИЧНО ЗАБОРОНЕНО фолбечитись до показу всіх інших відділень міста!
    // Для Укрпошти: у селах/СМТ відділення мають поштовий індекс замість номера 1-9, тому показуємо відділення населеного пункту з індексом
    if (results.length === 0) {
      if (!isNP && parsed.matchedSettlement) {
        const sName = parsed.matchedSettlement.name.toLowerCase();
        const cityOnly = allStaticBranches.filter(b => b.city && b.city.toLowerCase() === sName);
        if (cityOnly.length > 0) results = cityOnly;
      } else if (!parsed.targetBranchNumber) {
        if (staticMatches.length > 0) {
          results = staticMatches;
        } else if (parsed.matchedSettlement) {
          const sName = parsed.matchedSettlement.name.toLowerCase();
          const cityOnly = allStaticBranches.filter(b => b.city && b.city.toLowerCase() === sName);
          if (cityOnly.length > 0) results = cityOnly;
        }
      }
    }

    // Формуємо інформацію про цільове відділення, якого немає в базі
    let missingTargetBranch = null;
    if (parsed.targetBranchNumber && results.length === 0) {
      missingTargetBranch = {
        number: parsed.targetBranchNumber,
        city: parsed.matchedSettlement ? parsed.matchedSettlement.name : ''
      };
      didYouMeanText = null;
    }

    state.currentResults = results;
    if (results.length === 1) {
      state.selectedBranch = results[0];
    } else {
      state.selectedBranch = null;
    }
    if (isExplicitSubmit || results.length === 0) {
      closeAutocomplete();
    }
    renderSearchResults(results, rawQuery, didYouMeanText, missingTargetBranch);

    // Запис у найчастіші запити та історію
    if (shouldRecordAnalytics) {
      const recordTitle = parsed.matchedSettlement ? parsed.matchedSettlement.name : rawQuery;
      recordFrequentQuery(recordTitle);
      recordSearchHistory(rawQuery, results.length);
    }

    // Оновлення карти: показуємо до 20 відділень знайденого міста, а шукане відділення виділяємо!
    if (state.isMapVisible && state.leafletMap) {
      let mapBranches = [];
      let targetBranch = results.length === 1 ? results[0] : (results.length > 0 ? results[0] : null);

      if (results.length > 0) {
        mapBranches = results.slice(0, 20);
      } else if (allCityBranches.length > 0) {
        mapBranches = allCityBranches.slice(0, 20);
      } else if (parsed && parsed.matchedSettlement) {
        const allBranches = getAllCurrentServiceBranches();
        const sName = parsed.matchedSettlement.name.toLowerCase();
        mapBranches = allBranches.filter(b => b.city && b.city.toLowerCase() === sName).slice(0, 20);
      }

      updateMapMarkers(mapBranches, targetBranch);
      if (targetBranch && targetBranch.lat && targetBranch.lng) {
        state.leafletMap.flyTo([targetBranch.lat, targetBranch.lng], 14, { duration: 1.0 });
      } else if (parsed.matchedSettlement && parsed.matchedSettlement.lat) {
        state.leafletMap.flyTo([parsed.matchedSettlement.lat, parsed.matchedSettlement.lng], 13, { duration: 1.0 });
      } else if (mapBranches.length === 0 && ukraineBounds) {
        state.leafletMap.fitBounds(ukraineBounds);
      }
    }
    } catch (err) {
      console.error('executeSearch ERROR:', err);
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
    street = street.replace(/\\n|\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const city = branch.city || '';
    const escapedCity = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    street = street.replace(new RegExp(`^${escapedCity}[,\\s]*`, 'i'), '').trim();
    street = street.replace(/^(?:вул\.?\s+)+(?=(?:вул|вулиця|просп|проспект|пр-т|пл|площа|бульв|бульвар|б-р|пров|провулок|шосе|наб|набережна|узвіз|майдан|тупик|алея|квартал|мікрорайон|мкрн|урочище|ст\.|станція)(?:\.|[\s-]|$))/i, '');
    if (street && !/^(?:вул|вулиця|просп|проспект|пр-т|пл|площа|бульв|бульвар|б-р|пров|провулок|шосе|наб|набережна|узвіз|майдан|тупик|алея|квартал|мікрорайон|мкрн|урочище|ст\.|станція)(?:\.|[\s-]|$)/i.test(street)) {
      street = 'вул. ' + street;
    }
    return street;
  }

  const OBLAST_CENTER_RAIONS = {
    'Ужгород': 'Ужгородський',
    'Львів': 'Львівський',
    'Рівне': 'Рівненський',
    'Луцьк': 'Луцький',
    'Тернопіль': 'Тернопільський',
    'Івано-Франківськ': 'Івано-Франківський',
    'Хмельницький': 'Хмельницький',
    'Житомир': 'Житомирський',
    'Чернівці': 'Чернівецький',
    'Вінниця': 'Вінницький',
    'Чернігів': 'Чернігівський',
    'Суми': 'Сумський',
    'Полтава': 'Полтавський',
    'Харків': 'Харківський',
    'Дніпро': 'Дніпровський',
    'Запоріжжя': 'Запорізький',
    'Миколаїв': 'Миколаївський',
    'Херсон': 'Херсонський',
    'Одеса': 'Одеський',
    'Кропивницький': 'Кропивницький',
    'Черкаси': 'Черкаський'
  };

  // Географічна прив'язка (Район, область) для швидкої звірки з клієнтом
  function formatGeoSub(branch) {
    let oblast = branch.oblast || '';
    let raion = branch.raion || '';
    const city = branch.city || '';

    if (!raion && OBLAST_CENTER_RAIONS[city]) {
      raion = OBLAST_CENTER_RAIONS[city];
    }
    if ((!oblast || !raion) && window.SmartSearchEngine && window.SmartSearchEngine.UKRAINE_SETTLEMENTS) {
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

  // Уніфікована перевірка поштомату (без урахування регістру) за всіма можливими полями
  function isPostomatBranch(b) {
    if (!b) return false;
    const hay = [b.CategoryOfWarehouse, b.TypeOfWarehouse, b.type, b.typeClass, b.typeName, b.typeText, b.name, b.Description, b.description]
      .filter(Boolean).join(' ').toLowerCase();
    return /postomat|poshtomat|поштомат|почтомат/.test(hay) ||
      b.TypeOfWarehouse === 'f9316480-5f2d-425d-bc2c-ac7cd29decf0';
  }

  function isCargoBranch(b) {
    if (!b || isPostomatBranch(b)) return false;
    const totalWeight = parseFloat(b.totalMaxWeightAllowed || b.TotalMaxWeightAllowed) || 0;
    const placeWeight = parseFloat(b.placeMaxWeightAllowed || b.PlaceMaxWeightAllowed) || 0;
    const maxWeight = parseFloat(b.maxWeight) || parseFloat(b.weightLimit) || Math.max(totalWeight, placeWeight);

    // Якщо вага <= 30 кг — це СТРОГО "Відділення", навіть якщо в сирому полі опису випадково трапляється слово "вантажне"
    const isUnder30 = (maxWeight > 0 && maxWeight <= 30) ||
      (totalWeight > 0 && totalWeight <= 30) ||
      (placeWeight > 0 && placeWeight <= 30) ||
      /(?:до\s*(?:5|10|15|20|30)\s*кг|приймання-видачі)/i.test([b.name, b.typeText, b.typeName, b.Description].filter(Boolean).join(' '));
    if (isUnder30) return false;

    // Статус "Вантажне відділення" ТІЛЬКИ якщо (TotalMaxWeightAllowed >= 1000 || PlaceMaxWeightAllowed >= 1000 || CategoryOfWarehouse === "Cargo")
    return totalWeight >= 1000 ||
           placeWeight >= 1000 ||
           maxWeight >= 1000 ||
           b.CategoryOfWarehouse === 'Cargo';
  }

  function isRegularBranch(b) {
    if (!b || isPostomatBranch(b)) return false;
    return !isCargoBranch(b);
  }

  // Визначення бейджа типу, вагового обмеження та габаритів
  function getTypeBadgeInfo(branch) {
    if (isPostomatBranch(branch)) {
      return { label: 'Поштомат (до 20 кг)', cls: 'poshtomat' };
    }

    if (isCargoBranch(branch)) {
      const weight = branch.totalMaxWeightAllowed || branch.maxWeight || 1100;
      const dims = branch.dimensions || branch.maxDimensions || '600×220×220 см';
      return { label: `до ${weight} кг, ${dims}`, cls: 'cargo' };
    }

    const weight = branch.totalMaxWeightAllowed || branch.maxWeight || 30;
    const cls = weight <= 10 ? 'pickup' : 'post';
    return { label: `Поштове (до ${weight} кг)`, cls };
  }


  // 1. Класичний формат копіювання (для звичайних клієнтів/накладних)
  // Приклад: «місто Ужгород, Відділення №1: вул. Волонтерів, 16»
  // Приклад: «село Городок, Вантажне відділення №1: вул. барона Штейнгеля, 2-А»
  function formatClassicCopyString(branch) {
    let sType = branch.settlementType || '';
    const city = branch.city || '';

    if (!sType && window.SmartSearchEngine && window.SmartSearchEngine.UKRAINE_SETTLEMENTS) {
      const found = window.SmartSearchEngine.UKRAINE_SETTLEMENTS.find(s => s.name.toLowerCase() === city.toLowerCase() || (s.cleanName && s.cleanName.toLowerCase() === city.toLowerCase()));
      if (found) sType = found.type;
    }
    if (!sType) sType = 'місто';

    let sTypeFull = sType.trim().toLowerCase();
    if (sTypeFull === 'м.' || sTypeFull === 'м' || sTypeFull === 'місто') sTypeFull = 'місто';
    else if (sTypeFull === 'с.' || sTypeFull === 'с' || sTypeFull === 'село') sTypeFull = 'село';
    else if (sTypeFull.includes('смт')) sTypeFull = 'смт';
    else if (sTypeFull.includes('сел')) sTypeFull = 'селище';

    const isPost = isPostomatBranch(branch);
    const isCarg = isCargoBranch(branch);

    let typeTitle = 'Відділення';
    if (isPost) {
      typeTitle = 'Поштомат';
    } else if (isCarg) {
      typeTitle = 'Вантажне відділення';
    }

    const num = branch.number || branch.postalCode || '1';
    const street = getCleanStreet(branch);

    return `${sTypeFull} ${city}, ${typeTitle} №${num}: ${street}`;
  }

  // 2. Розширений детальний CRM-формат (з областю, районом у дужках та вагою)
  // Приклад: «м. Ужгород (Ужгородський р-н, Закарпатська обл.), Вантажне відділення №1 (до 1100 кг): вул. Волонтерів, 16»
  // Приклад: «с. Городок (Рівненський р-н, Рівненська обл.), Вантажне відділення №1 (до 1100 кг): вул. барона Штейнгеля, 2-А»
  function formatDetailedCopyString(branch) {
    let sType = branch.settlementType || '';
    const city = branch.city || '';

    if (!sType && window.SmartSearchEngine && window.SmartSearchEngine.UKRAINE_SETTLEMENTS) {
      const found = window.SmartSearchEngine.UKRAINE_SETTLEMENTS.find(s => s.name.toLowerCase() === city.toLowerCase() || (s.cleanName && s.cleanName.toLowerCase() === city.toLowerCase()));
      if (found) sType = found.type;
    }
    if (!sType) sType = 'місто';

    let sTypePrefix = sType.trim().toLowerCase();
    if (sTypePrefix === 'село' || sTypePrefix === 'с' || sTypePrefix === 'с.') sTypePrefix = 'с.';
    else if (sTypePrefix === 'місто' || sTypePrefix === 'м' || sTypePrefix === 'м.') sTypePrefix = 'м.';
    else if (sTypePrefix === 'смт' || sTypePrefix.includes('селище міського типу')) sTypePrefix = 'смт';
    else if (sTypePrefix === 'селище' || sTypePrefix === 'сел' || sTypePrefix === 'сел.') sTypePrefix = 'сел.';
    else if (!sTypePrefix.endsWith('.')) sTypePrefix = sTypePrefix + '.';

    let oblast = branch.oblast || '';
    let raion = branch.raion || '';
    if (!raion && OBLAST_CENTER_RAIONS[city]) {
      raion = OBLAST_CENTER_RAIONS[city];
    }
    if ((!oblast || !raion) && window.SmartSearchEngine && window.SmartSearchEngine.UKRAINE_SETTLEMENTS) {
      const found = window.SmartSearchEngine.UKRAINE_SETTLEMENTS.find(s => s.name.toLowerCase() === city.toLowerCase());
      if (found) {
        if (!oblast) oblast = found.oblast;
        if (!raion) raion = found.raion;
      }
    }

    const raionClean = (raion || '').replace(/\s*(?:район|р-н)$/i, '').trim();
    const oblClean = (oblast || '').replace(/\s*(?:область|обл\.?)$/i, '').trim();

    const geoParts = [];
    if (raionClean) {
      geoParts.push(`${raionClean} р-н`);
    }
    if (oblClean) {
      geoParts.push(`${oblClean} обл.`);
    }
    const geoBracket = geoParts.length > 0 ? ` (${geoParts.join(', ')})` : '';

    const isPost = isPostomatBranch(branch);
    const isCarg = isCargoBranch(branch);

    let typeTitle = 'Відділення';
    if (isPost) {
      typeTitle = 'Поштомат';
    } else if (isCarg) {
      typeTitle = 'Вантажне відділення';
    }

    const num = branch.number || branch.postalCode || '1';
    const street = getCleanStreet(branch);

    let weightText = '';
    if (isCarg) {
      const weight = branch.totalMaxWeightAllowed || branch.maxWeight || 1100;
      weightText = ` (до ${weight} кг)`;
    } else if (isPost) {
      const weight = branch.totalMaxWeightAllowed || branch.maxWeight || 20;
      weightText = ` (до ${weight} кг)`;
    } else if (branch.totalMaxWeightAllowed || branch.maxWeight) {
      const weight = branch.totalMaxWeightAllowed || branch.maxWeight;
      weightText = ` (до ${weight} кг)`;
    }

    return `${sTypePrefix} ${city}${geoBracket}, ${typeTitle} №${num}${weightText}: ${street}`;
  }

  // Для зворотної сумісності: formatLpCrmCopyString повертає детальний формат
  function formatLpCrmCopyString(branch) {
    return formatDetailedCopyString(branch);
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
    function execCommandFallback(str) {
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '-9999px';
      ta.style.opacity = '0';
      ta.setAttribute('readonly', '');
      document.body.appendChild(ta);
      ta.focus();
      if (typeof ta.select === 'function') {
        ta.select();
      }
      if (ta.setSelectionRange) {
        ta.setSelectionRange(0, str.length);
      }
      try {
        document.execCommand('copy');
      } catch (e) {
        console.warn('Fallback copy error:', e);
      }
      document.body.removeChild(ta);
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).catch(() => {
        execCommandFallback(text);
      });
    } else {
      execCommandFallback(text);
    }

    if (btnElement) {
      if (!btnElement._originalHtml) {
        btnElement._originalHtml = btnElement.innerHTML;
      }
      if (btnElement._copyTimeout) {
        clearTimeout(btnElement._copyTimeout);
      }
      btnElement.classList.add('copied');
      btnElement.innerHTML = `<span>✓</span> <span>${successText || 'Скопійовано!'}</span>`;
      btnElement._copyTimeout = setTimeout(() => {
        btnElement.classList.remove('copied');
        if (btnElement._originalHtml) {
          btnElement.innerHTML = btnElement._originalHtml;
          delete btnElement._originalHtml;
        }
        delete btnElement._copyTimeout;
      }, 2000);
    }

    showToast(text);
  }

  // Створення повнорозмірної картки відділення (з'являється тільки при виборі конкретної адреси)
  function createFullBranchCard(branch, query = state.searchQuery) {
    const card = document.createElement('div');
    card.className = 'branch-card';

    let sType = branch.settlementType || '';
    if (!sType && window.SmartSearchEngine) {
      const found = window.SmartSearchEngine.UKRAINE_SETTLEMENTS.find(s => s.name.toLowerCase() === (branch.city || '').toLowerCase());
      if (found) sType = found.type;
    }
    if (!sType) sType = 'місто';

    const isUkrposhta = state.currentService === 'ukrposhta' || (branch.id && branch.id.startsWith('up-'));
    const postalCode = (branch.postalCode || branch.number || '').toString().trim();
    const classicCopyText = formatClassicCopyString(branch);
    const detailedCopyText = formatDetailedCopyString(branch);
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

    let typeDisplay;
    if (isPostomatBranch(branch)) {
      typeDisplay = 'Поштомат';
    } else if (isCargoBranch(branch)) {
      typeDisplay = 'Вантажне відділення';
    } else {
      typeDisplay = 'Відділення';
    }

    const branchNumber = (branch.number || branch.Number || branch.postalCode || branch.PostalCode || '').toString().trim();
    const primaryLineText = `${sType} ${branch.city || ''} - ${typeDisplay} №${branchNumber}: ${cleanStreet}`;

    const hlCity = highlightMatch(branch.city || '', query);
    const hlNumber = highlightMatch(branchNumber, query);
    const hlStreet = highlightMatch(cleanStreet, query);
    const hlGeoSub = geoSub ? highlightMatch(geoSub, query) : '';

    card.innerHTML = `
      <!-- Рядок 1: місто [Місто] - [Тип] №[Номер]: [Вулиця] (одне речення без іконок та крапок) -->
      <div class="card-primary-line" title="${escapeHtml(primaryLineText)}">
        <span class="city-highlight">${escapeHtml(sType)} ${hlCity}</span>
        <span class="line-sep">-</span>
        <span class="branch-highlight">${escapeHtml(typeDisplay)} №${hlNumber}:</span>
        <span class="street-highlight">${hlStreet}</span>
      </div>

      <!-- Рядок 2: Населений пункт (район, область) -->
      <div class="card-geo-line" title="Населений пункт: ${escapeHtml(sType)} ${escapeHtml(branch.city || '')}${geoSub ? ', ' + escapeHtml(geoSub) : ''}">
        <span class="geo-label">Населений пункт:</span>
        <span class="geo-val">${escapeHtml(sType)} ${hlCity}${hlGeoSub ? ', ' + hlGeoSub : ''}</span>
      </div>

      ${renamingHtml}

      <div class="card-foot">
        <button class="btn-copy-action btn-copy-short" type="button" title="Скопіювати класичний формат">
          📋 Скопіювати
        </button>
        <button class="btn-copy-action btn-copy-detailed" type="button" title="Скопіювати розширений CRM-формат (з областю, районом та вагою)">
          📋 Детально
        </button>
        <span class="weight-pill ${typeInfo.cls}">${escapeHtml(typeInfo.label)}</span>
        <span class="status-pill"><span class="status-dot"></span> Працює</span>
      </div>
    `;

    const btnCopyShort = card.querySelector('.btn-copy-short') || card.querySelector('.btn-copy-action');
    if (btnCopyShort) {
      btnCopyShort.addEventListener('click', (e) => {
        e.stopPropagation();
        copyTextToClipboard(classicCopyText, btnCopyShort, 'Скопійовано!');
      });
    }

    const btnCopyDetailed = card.querySelector('.btn-copy-detailed');
    if (btnCopyDetailed) {
      btnCopyDetailed.addEventListener('click', (e) => {
        e.stopPropagation();
        copyTextToClipboard(detailedCopyText, btnCopyDetailed, 'Детально скопійовано!');
      });
    }

    return card;
  }

  function renderSearchResults(branches, query, didYouMeanText, missingTargetBranch) {
    dom.searchResultsSection.classList.remove('hidden');

    // 1. Фільтрація за типом (Всі | Вантажні | Відділення | Поштомати)
    let filtered = branches || [];
    if (state.typeFilter === 'postomat') {
      filtered = filtered.filter(isPostomatBranch);
    } else if (state.typeFilter === 'cargo') {
      filtered = filtered.filter(isCargoBranch);
    } else if (state.typeFilter === 'branch') {
      filtered = filtered.filter(isRegularBranch);
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
        executeSearch(didYouMeanText, true, true);
        focusSearchInputAtEnd(true);
        setTimeout(() => focusSearchInputAtEnd(true), 25);
      });
    } else if (dom.didYouMeanBox) {
      dom.didYouMeanBox.classList.add('hidden');
    }

    // EMPTY STATE: Якщо нічого не знайдено
    if (filtered.length === 0) {
      if (dom.didYouMeanBox) dom.didYouMeanBox.classList.add('hidden');
      if (dom.limitSelector) dom.limitSelector.style.display = 'none';
      // Панель табів залишається видимою, щоб можна було переключитись на інший таб
      applyTypeFiltersVisibility();
      dom.resultsCount.textContent = '0 відділень';

      if (missingTargetBranch) {
        const cityPart = missingTargetBranch.city ? ` у м. ${escapeHtml(missingTargetBranch.city)}` : '';
        dom.resultsList.innerHTML = `
          <div class="empty-results-box" style="padding: 40px 16px; text-align: center; color: var(--text-muted); width: 100%;">
            <div style="font-size: 38px; margin-bottom: 12px;">⚠️</div>
            <h4 style="font-weight: 800; color: var(--text-main); font-size: 16px; margin-bottom: 6px;">
              Відділення або поштомат №${escapeHtml(missingTargetBranch.number)}${cityPart} не знайдено.
            </h4>
            <p style="font-size: 13px; max-width: 500px; margin: 0 auto; line-height: 1.5; color: var(--text-muted);">
              Перевірте правильність введеного номера.
            </p>
          </div>
        `;
      } else {
        dom.resultsList.innerHTML = `
          <div style="padding: 36px 16px; text-align: center; color: var(--text-muted); width: 100%;">
            <div style="font-size: 36px; margin-bottom: 10px;">🔍</div>
            <h4 style="font-weight: 800; color: var(--text-main); font-size: 16px; margin-bottom: 6px;">
              Населений пункт або відділення не знайдено
            </h4>
            <p style="font-size: 13px; max-width: 500px; margin: 0 auto; line-height: 1.5;">
              За запитом «${escapeHtml(query || state.searchQuery)}» нічого не знайдено. Перевірте правильність написання міста або номера відділення.
            </p>
          </div>
        `;
      }
      return;
    }

    // РЕЖИМ 1: КОРИСТУВАЧ ОБРАВ КОНКРЕТНЕ ВІДДІЛЕННЯ (або є 1 точний результат)
    // Повну картку показуємо тільки коли вже вибрано конкретну адресу!
    // Зайві елементи масового списку (ліміти 5/10/20, фільтри) ховаємо для 100% фокусу на картці.
    if (state.selectedBranch) {
      if (dom.limitSelector) dom.limitSelector.style.display = 'none';
      if (dom.resultsTypeFilters) dom.resultsTypeFilters.style.display = 'none';
      dom.resultsCount.textContent = `1 обране відділення`;
      const branch = state.selectedBranch;

      const container = document.createElement('div');
      container.className = 'selected-branch-container';
      container.style.width = '100%';

      let backBtnHtml = '';
      if (filtered.length > 1) {
        backBtnHtml = `
          <div class="selected-branch-header">
            <button type="button" class="btn-back-to-matches" id="btnBackToMatches">
              <span>←</span>
              <span>Показати всі збіги адреси (${filtered.length})</span>
            </button>
          </div>
        `;
      }

      container.innerHTML = backBtnHtml;

      const card = createFullBranchCard(branch, query || state.searchQuery);
      container.appendChild(card);
      dom.resultsList.appendChild(container);

      if (filtered.length > 1) {
        const btnBack = container.querySelector('#btnBackToMatches');
        if (btnBack) {
          btnBack.addEventListener('click', () => {
            state.selectedBranch = null;
            renderSearchResults(branches, query, didYouMeanText, missingTargetBranch);
          });
        }
      }
      return;
    }

    // РЕЖИМ 2: ПОШУК ПО АДРЕСІ — ПОКАЗУЄМО СУТО ЗБІГИ АДРЕСИ В 1 КОЛОНКУ (як в LP-CRM)
    if (dom.limitSelector) dom.limitSelector.style.display = '';
    applyTypeFiltersVisibility();
    dom.resultsCount.textContent = `${filtered.length} збігів адреси`;

    let limitNum = 20;
    if (state.displayLimit !== 'all') {
      limitNum = parseInt(state.displayLimit, 10) || 10;
    }
    // Жорстке обмеження одночасно згенерованих карток у DOM (до 20 карток)
    const maxNodes = Math.min(limitNum, 20);
    const toDisplay = filtered.slice(0, maxNodes);

    // DocumentFragment для єдиної атомарної вставки без Layout Thrashing та Browser Reflow
    const fragment = document.createDocumentFragment();

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
      const isPostomat = isPostomatBranch(branch);
      const isCargo = isCargoBranch(branch);
      const isUkrposhta = state.currentService === 'ukrposhta' || (branch.id && branch.id.startsWith('up-'));
      const branchNumber = (branch.number || branch.Number || branch.postalCode || branch.PostalCode || '').toString().trim();
      const postalCode = (branch.postalCode || branch.PostalCode || '').toString().trim();

      let typeDisplay;
      if (isPostomat) {
        typeDisplay = 'Поштомат';
      } else if (isCargo) {
        typeDisplay = 'Вантажне відділення';
      } else {
        typeDisplay = 'Відділення';
      }

      const hlNumber = highlightMatch(branchNumber, query || state.searchQuery);
      const hlStreet = highlightMatch(cleanStreet, query || state.searchQuery);
      const hlCity = highlightMatch(branch.city || '', query || state.searchQuery);
      const hlGeoSub = geoSub ? highlightMatch(geoSub, query || state.searchQuery) : '';

      const branchTitle = `${typeDisplay} №${hlNumber}: <span class="street-part">${hlStreet}</span>`;
      const locationSub = `${escapeHtml(sType)} ${hlCity}${hlGeoSub ? ', ' + hlGeoSub : ''}`;

      row.innerHTML = `
        <div class="address-match-left">
          <div class="address-match-icon">${isPostomat ? '📦' : '🏢'}</div>
          <div class="address-match-content">
            <div class="address-match-title">${branchTitle}</div>
            <div class="address-match-sub">${locationSub}</div>
          </div>
        </div>
        <div class="address-match-right">
          ${isUkrposhta && postalCode ? `<span class="ukrposhta-index-badge-sm">📮 ІНДЕКС: ${escapeHtml(postalCode)}</span>` : ''}
          <span class="weight-pill ${typeInfo.cls}">${escapeHtml(typeInfo.label)}</span>
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

      fragment.appendChild(row);
    });

    dom.resultsList.appendChild(fragment);
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
        executeSearch(item.query, true, true);
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

    const topFive = filtered.filter(item => item.service === state.currentService).slice(0, 5);
    const otherServices = filtered.filter(item => item.service !== state.currentService).slice(0, 5);
    saveSearchHistory(topFive.concat(otherServices));
    renderRecentHistory();
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
    const list = (items || getSearchHistory()).filter(item => item.service === state.currentService);
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
        executeSearch(item.query, true, true);
        focusSearchInputAtEnd(true);
        setTimeout(() => focusSearchInputAtEnd(true), 25);
      });

      dom.recentHistoryList.appendChild(card);
    });
  }

  // ==========================================================================
  // 5. ТЕМНА КАРТА LEAFLET (OPENSTREETMAP + DARK MODE CSS)
  // ==========================================================================
  const ukraineBounds = (typeof L !== 'undefined' && L.latLngBounds)
    ? L.latLngBounds(L.latLng(44.0, 22.0), L.latLng(52.5, 40.5))
    : null;

  function initMapIfNeeded() {
    if (state.leafletMap) return;
    if (typeof L === 'undefined') return;

    const bounds = ukraineBounds || (L.latLngBounds && L.latLngBounds(L.latLng(44.0, 22.0), L.latLng(52.5, 40.5)));

    // Ініціалізація карти з Canvas-рендерером та жорсткими межами України
    state.leafletMap = L.map('branchesMap', {
      preferCanvas: true,
      maxBounds: bounds,
      maxBoundsViscosity: 1.0,
      minZoom: 6,
      maxZoom: 18
    });

    window.leafMap = state.leafletMap;

    // Стандартні відкриті тайли OpenStreetMap без обмежень та вотермарок
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      minZoom: 6,
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(state.leafletMap);

    state.markersGroup = L.layerGroup().addTo(state.leafletMap);

    // Початковий вигляд: територія України
    if (bounds) {
      state.leafletMap.fitBounds(bounds);
    } else {
      state.leafletMap.setView([48.5, 31.5], 6);
    }
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
        if (window.leafMap) window.leafMap.invalidateSize();
        if (state.leafletMap) state.leafletMap.invalidateSize();

        let mapBranches = [];
        let targetBranch = state.selectedBranch || (state.currentResults.length > 0 ? state.currentResults[0] : null);

        if (state.currentResults && state.currentResults.length > 0) {
          mapBranches = state.currentResults.slice(0, 20);
        } else if (state.searchQuery && window.SmartSearchEngine) {
          const parsed = window.SmartSearchEngine.parseQuery(state.searchQuery);
          if (parsed && parsed.matchedSettlement) {
            const sName = parsed.matchedSettlement.name.toLowerCase();
            const allBranches = getAllCurrentServiceBranches();
            mapBranches = allBranches.filter(b => b.city && b.city.toLowerCase() === sName).slice(0, 20);
          }
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
      if (state.markersGroup) {
        state.markersGroup.clearLayers();
      }
      if (state.userLocationMarker && state.leafletMap) {
        state.leafletMap.removeLayer(state.userLocationMarker);
        state.userLocationMarker = null;
      }
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

    // Захист від зависання: суворо не більше 20 точок одночасно
    const safeBranches = (branches || []).slice(0, 20);
    dom.mapMarkersCount.textContent = `(${safeBranches.length} відділень)`;

    const boundsObj = ukraineBounds || (typeof L !== 'undefined' && L.latLngBounds ? L.latLngBounds(L.latLng(44.0, 22.0), L.latLng(52.5, 40.5)) : null);

    if (safeBranches.length === 0) {
      if (boundsObj && state.leafletMap) {
        state.leafletMap.fitBounds(boundsObj);
      }
      return;
    }

    const isNP = state.currentService === 'novaposhta';
    const regularPin = createCustomPin(isNP, false);
    const highlightedPin = createCustomPin(isNP, true);
    const bounds = [];
    let targetMarker = null;

    safeBranches.forEach(b => {
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
            <p style="margin: 4px 0; font-size: 12.5px; color: var(--text-main); font-weight: 500;">📍 <strong>${escapeHtml(b.city)}</strong>, ${escapeHtml(b.address || b.street)}</p>
            <p style="margin: 4px 0; font-size: 11.5px; color: var(--text-muted);">🕒 ${escapeHtml(b.schedule || 'Пн-Пт 08:00-19:00')}</p>
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
    } else if (boundsObj) {
      state.leafletMap.fitBounds(boundsObj);
    }
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
    return String(str)
      .replace(/\\n|\r?\n/g, ' ')
      .replace(/\s{2,}/g, ' ')
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
  let isAutocompleteOpen = false;
  let activeAutocompleteAbortController = null;
  let autocompleteDebounceTimer = null;
  let liveSearchDebounceTimer = null;

  function closeAutocomplete() {
    if (!dom.autocompleteDropdown) return;
    dom.autocompleteDropdown.classList.add('hidden');
    dom.autocompleteDropdown.innerHTML = '';
    activeAutocompleteIndex = -1;
    autocompleteItems = [];
    isAutocompleteOpen = false;
  }

  const HIGHLIGHT_STOP_WORDS = new Set([
    'вул', 'вулиця', 'просп', 'проспект', 'пр-т', 'прт', 'буд', 'будинок',
    'пров', 'провулок', 'бульв', 'бульвар', 'б-р', 'пл', 'площа', 'шосе',
    'наб', 'набережна', 'узвіз', 'майдан', 'тупик', 'алея', 'квартал', 'мкрн',
    'обл', 'область', 'район', 'р-н', 'рн', 'селище', 'село', 'місто', 'смт',
    'відділення', 'віділення', 'відділ', 'вантажне', 'вантажний', 'пункт',
    'поштомат', 'почтомат', 'нова', 'пошта', 'укрпошта', 'вд', 'пм', 'номер',
    'вага', 'до', 'кг'
  ]);

  function highlightMatch(text, query) {
    if (!text) return '';
    if (!query) return escapeHtml(text);

    let cleanQuery = query;
    if (window.SmartSearchEngine && window.SmartSearchEngine.fixKeyboardLayout) {
      cleanQuery = window.SmartSearchEngine.fixKeyboardLayout(query);
    }

    const rawTokens = cleanQuery.toLowerCase().split(/[^\p{L}0-9]+/u).filter(Boolean);
    const patterns = new Set();

    for (const t of rawTokens) {
      if (HIGHLIGHT_STOP_WORDS.has(t)) continue;
      if (/^\d+$/.test(t)) {
        patterns.add('(?<!\\d)' + escapeRegex(t) + '(?!\\d)');
        patterns.add('(?<=№)' + escapeRegex(t));
      } else if (t.length >= 3) {
        patterns.add('(?<!\\p{L})' + escapeRegex(t) + '(?!\\p{L})');
        let stem = '';
        if (window.SmartSearchEngine && window.SmartSearchEngine.getRaionStem) {
          stem = window.SmartSearchEngine.getRaionStem(t);
        } else {
          stem = t.replace(/(?:енськ|инськ|івськ|овськ|ськ|цьк|зьк)(?:ий|ого|ому|им|е|а)?$/iu, '')
                  .replace(/(?:ний|ного|ному|не|на|тий|того)$/iu, '');
        }
        if (stem && stem.length >= 3 && !HIGHLIGHT_STOP_WORDS.has(stem)) {
          patterns.add('(?<!\\p{L})' + escapeRegex(stem) + '[\\p{L}]*');
        }
      } else if (t.length >= 2) {
        patterns.add('(?<!\\p{L})' + escapeRegex(t));
      }
    }

    if (patterns.size === 0) return escapeHtml(text);

    const combinedRegex = new RegExp('(' + Array.from(patterns).join('|') + ')', 'giu');
    const safeText = escapeHtml(text);
    return safeText.replace(combinedRegex, (match, _p1, offset, fullStr) => {
      // Перевіряємо повне слово навколо збігу, щоб ніколи не підсвічувати службові слова
      let start = offset;
      let end = offset + match.length;
      while (start > 0 && /[\p{L}-]/u.test(fullStr[start - 1])) start--;
      while (end < fullStr.length && /[\p{L}-]/u.test(fullStr[end])) end++;
      const wholeWord = fullStr.slice(start, end).toLowerCase();
      const wholeWordNoHyphen = wholeWord.replace(/^-+|-+$/g, '');
      if (HIGHLIGHT_STOP_WORDS.has(wholeWord) || HIGHLIGHT_STOP_WORDS.has(wholeWordNoHyphen)) {
        return match;
      }
      return '<mark class="hl-match">' + match + '</mark>';
    });
  }

  function getCitySubtitleHighlightQuery(query, cityTitle) {
    if (!query) return '';
    let q = query;
    if (window.SmartSearchEngine && window.SmartSearchEngine.fixKeyboardLayout) {
      q = window.SmartSearchEngine.fixKeyboardLayout(query);
    }
    const cityWords = String(cityTitle || '').toLowerCase().split(/[^\p{L}0-9]+/u).filter(Boolean);
    const tokens = q.toLowerCase().split(/[^\p{L}0-9]+/u).filter(Boolean);
    const remaining = tokens.filter(tok => {
      if (HIGHLIGHT_STOP_WORDS.has(tok)) return false;
      for (const cw of cityWords) {
        if (cw === tok || cw.startsWith(tok) || tok.startsWith(cw)) return false;
      }
      return true;
    });
    return remaining.join(' ');
  }

  function getBranchStreetHighlightQuery(query, item) {
    if (!query) return '';
    let q = query;
    if (window.SmartSearchEngine && window.SmartSearchEngine.fixKeyboardLayout) {
      q = window.SmartSearchEngine.fixKeyboardLayout(query);
    }
    const cityWords = String(item.value || (item.branchObj && item.branchObj.city) || '')
      .toLowerCase()
      .split(/[^\p{L}0-9]+/u)
      .filter(Boolean);
    const tokens = q.toLowerCase().split(/[^\p{L}0-9]+/u).filter(Boolean);
    const wordTokens = [];
    const numTokens = [];
    for (const tok of tokens) {
      if (HIGHLIGHT_STOP_WORDS.has(tok)) continue;
      if (/^\d+$/.test(tok)) {
        numTokens.push(tok);
        continue;
      }
      let isCityWord = false;
      for (const cw of cityWords) {
        if (cw === tok || (tok.length >= 3 && cw.startsWith(tok))) {
          isCityWord = true;
          break;
        }
      }
      if (!isCityWord) {
        wordTokens.push(tok);
      }
    }
    if (wordTokens.length > 0) {
      return wordTokens.concat(numTokens).join(' ');
    }
    // Якщо введено лише місто + номер (напр. "київ 222"), не підсвічуємо цифри номерів будинків у рядку вулиці,
    // якщо номер вже збігається з номером відділення/поштомату
    const branchNum = item.branchObj && item.branchObj.number ? String(item.branchObj.number) : '';
    const unmatchedNums = numTokens.filter(n => !branchNum.startsWith(n));
    return unmatchedNums.join(' ');
  }

  function renderAutocomplete(suggestions, query) {
    if (!dom.autocompleteDropdown) return;

    if (!query || query.trim().length < 2) {
      closeAutocomplete();
      return;
    }

    const hasDigits = /\d/.test(query);

    dom.autocompleteDropdown.innerHTML = '';
    activeAutocompleteIndex = -1;

    // Якщо нічого не знайдено:
    // При наявності цифр (напр. "київ 99999" або "33159") закриваємо дропдаун, щоб показати картку помилки результатів.
    // При пошуку міста показуємо охайне повідомлення «Нічого не знайдено».
    if (!suggestions || suggestions.length === 0) {
      if (hasDigits) {
        closeAutocomplete();
        return;
      }
      autocompleteItems = [];
      dom.autocompleteDropdown.removeAttribute('data-mode');
      const emptyEl = document.createElement('div');
      emptyEl.className = 'autocomplete-empty';
      emptyEl.innerHTML = `
        <span style="display:inline-block; margin-right:6px;">🔍</span>
        <span>За запитом «<strong>${escapeHtml(query)}</strong>» міст чи відділень не знайдено</span>
      `;
      dom.autocompleteDropdown.appendChild(emptyEl);
      dom.autocompleteDropdown.classList.remove('hidden');
      isAutocompleteOpen = true;
      return;
    }

    autocompleteItems = suggestions;
    const isBranchMode = suggestions.some(s => s.mode === 'branch' || s.type === 'branch' || s.type === 'postomat');
    dom.autocompleteDropdown.setAttribute('data-mode', isBranchMode ? 'branch' : 'city');

    suggestions.forEach((item, idx) => {
      const el = document.createElement('div');
      const itemIsBranch = item.mode === 'branch' || item.type === 'branch' || item.type === 'postomat';
      el.className = 'autocomplete-item ' + (itemIsBranch ? 'autocomplete-item-branch' : 'autocomplete-item-city');
      el.setAttribute('role', 'option');
      el.setAttribute('data-index', idx);
      el.setAttribute('data-mode', itemIsBranch ? 'branch' : 'city');

      let iconHtml = item.icon || '📍';
      let badgeClass = 'badge-city';
      if (item.type === 'postomat') {
        iconHtml = '📦';
        badgeClass = 'badge-postomat';
      } else if (item.type === 'branch') {
        iconHtml = '🏢';
        badgeClass = item.isCargo ? 'badge-cargo' : 'badge-branch';
      } else if (item.type === 'смт' || item.type === 'селище') {
        badgeClass = 'badge-smt';
      } else if (item.type === 'село') {
        badgeClass = 'badge-village';
      }

      if (itemIsBranch) {
        // Компактна дворядкова структура відділення без дублюючих бейджів праворуч:
        // Рядок 1 (жирний): [Іконка] Відділення/Поштомат №X • (вага: до 30 кг / до 1100 кг)
        // Рядок 2 (вторинний сірий): вул. [Назва вулиці], [номер будинку] (Орієнтир/магазин, якщо є)
        const numOnlyQuery = (query.match(/\d+/g) || []).join(' ');
        const highlightedBranchTitle = highlightMatch(item.title, numOnlyQuery);
        const weightHtml = item.weightLabel
          ? ` <span class="autocomplete-sep">•</span> <span class="autocomplete-weight">${escapeHtml(item.weightLabel)}</span>`
          : '';
        const streetText = item.street || item.subtitle || '';
        const streetQuery = getBranchStreetHighlightQuery(query, item);
        const highlightedStreet = highlightMatch(streetText, streetQuery);

        el.innerHTML = `
          <div class="autocomplete-item-main">
            <div class="autocomplete-content autocomplete-content-branch">
              <div class="autocomplete-title"><span class="autocomplete-inline-icon">${iconHtml}</span><strong class="autocomplete-branch-name">${highlightedBranchTitle}</strong>${weightHtml}</div>
              <div class="autocomplete-sub autocomplete-street">${highlightedStreet}</div>
            </div>
          </div>
        `;
      } else {
        // Режим топонімів у дропдауні (City Suggestion Mode — формат LP-CRM):
        // Жирний текст: назва пункту; вторинний сірий текст у дужках праворуч: (Район р-н, Область обл.); бейдж типу праворуч (місто / смт / село)
        const highlightedTitle = highlightMatch(item.title, query);
        const subQuery = getCitySubtitleHighlightQuery(query, item.title);
        const highlightedSub = highlightMatch(item.subtitle, subQuery);

        el.innerHTML = `
          <div class="autocomplete-item-main">
            <div class="autocomplete-icon">${iconHtml}</div>
            <div class="autocomplete-content autocomplete-content-city">
              <strong class="autocomplete-title">${highlightedTitle}</strong>
              <span class="autocomplete-sub">${highlightedSub}</span>
            </div>
          </div>
          <span class="autocomplete-badge ${badgeClass}">${escapeHtml(item.badge || item.type)}</span>
        `;
      }

      // Запобігаємо втраті фокусу інпутом при виборі підказки
      const handleSelect = (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectAutocompleteItem(item);
      };

      el.addEventListener('mousedown', handleSelect);
      el.addEventListener('pointerdown', handleSelect);

      dom.autocompleteDropdown.appendChild(el);
    });

    dom.autocompleteDropdown.classList.remove('hidden');
    isAutocompleteOpen = true;
  }

  function selectAutocompleteItem(item) {
    if (!item) return;
    clearTimeout(autocompleteDebounceTimer);
    clearTimeout(liveSearchDebounceTimer);
    if (activeAutocompleteAbortController) {
      activeAutocompleteAbortController.abort();
      activeAutocompleteAbortController = null;
    }

    let fill = item.textToFill || item.title;
    const isSettlement = item.mode === 'city' || item.type === 'місто' || item.type === 'смт' || item.type === 'село' || item.type === 'селище';
    if (isSettlement && !fill.endsWith(' ')) {
      fill += ' ';
    }
    dom.searchInput.value = fill;
    dom.btnClearSearch.classList.remove('hidden');
    closeAutocomplete();

    if (item.branchObj) {
      const b = item.branchObj;
      state.searchQuery = fill.trim();
      state.selectedBranch = b;
      state.currentResults = [b];
      renderSearchResults([b], fill.trim(), null, null);
      recordFrequentQuery(b.city || fill.trim());
      recordSearchHistory(fill.trim(), 1);
      if (state.isMapVisible && state.leafletMap) {
        updateMapMarkers([b], b);
        if (b.lat && b.lng) {
          state.leafletMap.flyTo([b.lat, b.lng], 14, { duration: 1.2 });
        }
      }
      return;
    }

    executeSearch(fill.trim(), true, true);
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

  // Показує панель табів; для Укрпошти ховає «Вантажні» та «Поштомати»
  function applyTypeFiltersVisibility() {
    if (!dom.resultsTypeFilters) return;
    dom.resultsTypeFilters.style.display = '';
    const isUP = state.currentService === 'ukrposhta';
    ['cargo', 'postomat'].forEach(t => {
      const pill = dom.resultsTypeFilters.querySelector(`[data-type="${t}"]`);
      if (pill) pill.style.display = isUP ? 'none' : '';
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
    if (dom.btnThemeToggle) {
      dom.btnThemeToggle.addEventListener('click', toggleTheme);
    }
    dom.btnNovaPoshta.addEventListener('click', () => switchService('novaposhta'));
    dom.btnUkrposhta.addEventListener('click', () => switchService('ukrposhta'));

    dom.searchForm.addEventListener('submit', e => {
      e.preventDefault();
      clearTimeout(autocompleteDebounceTimer);
      clearTimeout(liveSearchDebounceTimer);
      if (activeAutocompleteAbortController) {
        activeAutocompleteAbortController.abort();
      }
      closeAutocomplete();
      executeSearch(dom.searchInput.value, true, true);
    });

    function triggerAutocomplete(val) {
      if (!val || val.length < 2) {
        closeAutocomplete();
        return;
      }
      let cityPool = null;
      let candidate = null;
      if (window.SmartSearchEngine) {
        const facets = window.SmartSearchEngine.extractFacets(val);
        if (facets && facets.city) {
          candidate = facets.city.toLowerCase();
        }
      }
      if (!candidate) {
        const cleanVal = val.replace(/^(?:м|с|смт|сел|місто|село|селище)\.?\s*/i, '').trim();
        candidate = cleanVal.split(/[, /;.]+/)[0].toLowerCase();
      }
      if (candidate && liveWarehousesCache.novaposhta.has(candidate)) {
        cityPool = liveWarehousesCache.novaposhta.get(candidate);
      }
      if (window.SmartSearchEngine) {
        const suggestions = window.SmartSearchEngine.getAutocompleteSuggestions(val, state.currentService, cityPool, getAllCurrentServiceBranches());
        renderAutocomplete(suggestions, val);
      }
    }

    // Відкриття поп-апу при кліку або фокусі на інпуті з вже введеним текстом
    const handleInputActivation = () => {
      if (suppressNextFocusActivation) return;
      const val = dom.searchInput.value.trim();
      if (val.length >= 2 && !isAutocompleteOpen) {
        // Якщо вже вибрано конкретне відділення і текст інпуту відповідає вибраному запиту, не перекриваємо картку при кліку
        if (state.selectedBranch && state.currentResults.length === 1 && val === state.searchQuery) {
          return;
        }
        triggerAutocomplete(val);
      }
    };
    dom.searchInput.addEventListener('focus', handleInputActivation);
    dom.searchInput.addEventListener('click', handleInputActivation);

    // Автодоповнення та миттєвий живий пошук при введенні (LP-CRM City Mode <-> Branch Mode + дебаунс + AbortController)
    dom.searchInput.addEventListener('input', () => {
      const val = dom.searchInput.value.trim();
      if (val.length > 0) {
        dom.btnClearSearch.classList.remove('hidden');
      } else {
        dom.btnClearSearch.classList.add('hidden');
        closeAutocomplete();
      }

      // Скасовуємо попередній незавершений запит автокомпліту
      if (activeAutocompleteAbortController) {
        activeAutocompleteAbortController.abort();
      }
      activeAutocompleteAbortController = new AbortController();
      const currentSignal = activeAutocompleteAbortController.signal;

      clearTimeout(autocompleteDebounceTimer);
      clearTimeout(liveSearchDebounceTimer);

      if (val.length >= 2) {
        if (!/\d/.test(val)) {
          dom.searchResultsSection.classList.add('hidden');

          // Дебаунс 300мс для підказок міст або відділень по вулиці (напр. "Львів наукова")
          autocompleteDebounceTimer = setTimeout(() => {
            if (currentSignal.aborted) return;
            triggerAutocomplete(val);
          }, 300);
        } else {
          // Коли в інпуті є розпізнане місто та цифра (напр. "Київ 1", "Київ 100"):
          // Дропдаун перебудовується в режим відділень (Branch Suggestion Mode), а результати оновлюються паралельно
          autocompleteDebounceTimer = setTimeout(() => {
            if (currentSignal.aborted) return;
            triggerAutocomplete(val);
          }, 300);
          liveSearchDebounceTimer = setTimeout(() => {
            if (!currentSignal.aborted) {
              executeSearch(val, false, false); // isExplicitSubmit = false
            }
          }, 300);
        }
      } else {
        closeAutocomplete();
        if (val.length === 0) {
          dom.searchResultsSection.classList.add('hidden');
        }
      }
    });

    // Навігація клавішами в autocomplete (ArrowUp, ArrowDown, Enter, Esc)
    dom.searchInput.addEventListener('keydown', (e) => {
      if (!dom.autocompleteDropdown || dom.autocompleteDropdown.classList.contains('hidden') || autocompleteItems.length === 0) {
        if (e.key === 'Escape') {
          closeAutocomplete();
        }
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
        e.preventDefault();
        closeAutocomplete();
      }
    });

    // Закриття автокомпліту ТІЛЬКИ при явному кліку поза межами інпута й поп-апу (без конфліктів фокусу blur)
    document.addEventListener('pointerdown', (e) => {
      const isInputClick = dom.searchInput && dom.searchInput.contains(e.target);
      const isDropdownClick = dom.autocompleteDropdown && dom.autocompleteDropdown.contains(e.target);
      if (!isInputClick && !isDropdownClick) {
        closeAutocomplete();
      }
    });

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

        if (state.searchQuery) {
          state.selectedBranch = null;
          executeSearch(state.searchQuery, false, false);
        } else if (state.currentResults.length > 0) {
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
      state.selectedBranch = null;
      if (state.isMapVisible) {
        updateMapMarkers([]);
      }
      dom.searchInput.focus();
    });

    dom.btnCloseResults.addEventListener('click', () => {
      dom.searchResultsSection.classList.add('hidden');
    });

    dom.btnToggleMap.addEventListener('click', toggleMapView);
    if (dom.btnCloseMap) {
      dom.btnCloseMap.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.isMapVisible) toggleMapView();
      });
    }
    if (dom.mapSection) {
      dom.mapSection.addEventListener('click', (e) => {
        const target = e.target;
        if (target && (target.id === 'btnCloseMap' || (target.closest && target.closest('#btnCloseMap')))) {
          e.preventDefault();
          e.stopPropagation();
          if (state.isMapVisible) toggleMapView();
        }
      });
    }
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
  // РЕЄСТРАЦІЯ ТА АВТОМАТИЧНЕ ОНОВЛЕННЯ SERVICE WORKER (v8.26.9)
  // ==========================================================================
  function initServiceWorker() {
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.clear) {
        sessionStorage.clear();
      }
    } catch (e) {}

    if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
      navigator.serviceWorker
        .register('./sw.js?v=8.26.9', { updateViaCache: 'none' })
        .then((reg) => {
          // Примусова перевірка наявності оновлення
          reg.update();

          // Якщо є воркер у черзі очікування — негайно активувати його
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }

          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            if (installing) {
              installing.addEventListener('statechange', () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                  installing.postMessage({ type: 'SKIP_WAITING' });
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn('[SW] Реєстрація Service Worker пропущена:', err);
        });

      // Перезавантажуємо вікно один раз, коли новий контролер переймає керування
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    // Очищення старих кешів на рівні браузера для гарантії актуальності версії
    if ('caches' in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => {
          if (key !== 'np-ukr-cache-v8.26.9') {
            caches.delete(key);
          }
        });
      }).catch(() => {});
    }
  }

  // ==========================================================================
  // ІНІЦІАЛІЗАЦІЯ ДОДАТКУ
  // ==========================================================================
  function init() {
    applyTheme(getStoredTheme(), false);
    initEventListeners();
    checkServerApiStatus();
    renderFrequentChips();
    renderRecentHistory();
    initHonestOnlineCounter();
    initServiceWorker();

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

  window.__executeSearchForTest = executeSearch;
  window.highlightMatch = highlightMatch;
  window.createFullBranchCard = createFullBranchCard;
  window.formatClassicCopyString = formatClassicCopyString;
  window.formatDetailedCopyString = formatDetailedCopyString;
  window.formatLpCrmCopyString = formatDetailedCopyString;
  if (window.SmartSearchEngine) {
    window.SmartSearchEngine.highlightMatch = highlightMatch;
    window.SmartSearchEngine.formatClassicCopyString = formatClassicCopyString;
    window.SmartSearchEngine.formatDetailedCopyString = formatDetailedCopyString;
  }

})();
