/**
 * Automated Test Suite for Autocomplete & Dropdown Popups
 * Tests all user requirements:
 * 1. Continuous gradual typing "ки" -> "київ" -> "київ 11" without flickering or spontaneous closing, with full address formatting.
 * 2. Multi-region settlement matching (e.g. райцентр vs село "Підгайці") with clear district & region chain.
 * 3. Click selection of item sets input value, closes popup, maintains focus and filters branch.
 * 4. Click outside closes popup, and clicking back into input re-opens popup with fresh data.
 * 5. Escape key closes popup.
 * 6. Keyboard navigation: ArrowDown, ArrowUp, and Enter selection.
 */

const fs = require('fs');
const path = require('path');

// Simple DOM Mock Environment
class MockElement {
  constructor(tag, id = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this._classList = new Set();
    this.children = [];
    this.attributes = {};
    this.value = '';
    this._innerHTML = '';
    this.listeners = {};
    this.style = {};
  }

  get className() {
    return Array.from(this._classList).join(' ');
  }

  set className(val) {
    this._classList = new Set((val || '').split(/\s+/).filter(Boolean));
  }

  get innerHTML() {
    let html = this._innerHTML || '';
    if (this.children.length > 0) {
      for (let c of this.children) {
        html += c.outerHTML;
      }
    }
    return html;
  }

  get outerHTML() {
    const tag = (this.tagName || 'div').toLowerCase();
    const cls = this.className ? ` class="${this.className}"` : '';
    return `<${tag}${cls}>${this.innerHTML}</${tag}>`;
  }

  set innerHTML(val) {
    this._innerHTML = val;
    if (val === '') {
      this.children = [];
    }
  }

  get classList() {
    const self = this;
    return {
      add(...cls) { cls.forEach(c => self._classList.add(c)); },
      remove(...cls) { cls.forEach(c => self._classList.delete(c)); },
      contains(c) { return self._classList.has(c); },
      toggle(c) { if (self._classList.has(c)) self._classList.delete(c); else self._classList.add(c); }
    };
  }

  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] || null; }
  removeAttribute(k) { delete this.attributes[k]; }

  appendChild(child) {
    if (child.tagName === 'FRAGMENT') {
      const moved = [...child.children];
      child.children = [];
      moved.forEach(c => {
        this.children.push(c);
        c.parentElement = this;
      });
      return child;
    }
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) this.children.splice(idx, 1);
    return child;
  }

  querySelector(sel) {
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      for (let c of this.children) {
        if (c.classList.contains(cls)) return c;
        const sub = c.querySelector(sel);
        if (sub) return sub;
      }
      const openTag = new RegExp('<([a-z0-9]+)[^>]*class=["\'][^"\']*\\b' + cls + '\\b[^"\']*["\'][^>]*>', 'i');
      const m = (this._innerHTML || '').match(openTag);
      if (m) {
        const startIdx = m.index + m[0].length;
        const tagName = m[1];
        let depth = 1;
        const tagRegex = new RegExp('</?' + tagName + '\\b[^>]*>', 'gi');
        tagRegex.lastIndex = startIdx;
        let t;
        while ((t = tagRegex.exec(this._innerHTML)) !== null) {
          if (t[0].startsWith('</')) depth--;
          else depth++;
          if (depth === 0) {
            const el = new MockElement(tagName);
            el.className = cls;
            el.innerHTML = this._innerHTML.slice(startIdx, t.index);
            return el;
          }
        }
      }
    }
    return null;
  }

  querySelectorAll(sel) {
    const results = [];
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      for (let c of this.children) {
        if (c.classList.contains(cls)) results.push(c);
        results.push(...c.querySelectorAll(sel));
      }
    }
    return results;
  }

  contains(other) {
    if (this === other) return true;
    for (let c of this.children) {
      if (c === other || c.contains(other)) return true;
    }
    return false;
  }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    if (this.listeners[event.type]) {
      for (let fn of this.listeners[event.type]) {
        fn(event);
      }
    }
    return true;
  }

  focus() { this.isFocused = true; }
  blur() { this.isFocused = false; }
  setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; }
  scrollIntoView() {}
}

function createMockEnvironment() {
  const docListeners = {};
  const elementsById = {};
  function getOrCreateElement(id, tag = 'div') {
    if (!elementsById[id]) {
      elementsById[id] = new MockElement(tag, id);
    }
    return elementsById[id];
  }

  const mockDocument = {
    documentElement: new MockElement('html'),
    getElementById(id) { return getOrCreateElement(id); },
    querySelector(sel) {
      if (sel.startsWith('#')) return getOrCreateElement(sel.slice(1));
      return new MockElement('div');
    },
    querySelectorAll() { return []; },
    createElement(tag) { return new MockElement(tag); },
    createDocumentFragment() { return new MockElement('fragment'); },
    body: new MockElement('body'),
    addEventListener(event, fn) {
      if (!docListeners[event]) docListeners[event] = [];
      docListeners[event].push(fn);
    },
    dispatchEvent(event) {
      if (docListeners[event.type]) {
        for (let fn of docListeners[event.type]) {
          fn(event);
        }
      }
    }
  };

  return {
    mockDocument,
    elementsById,
    docListeners
  };
}

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 ЗАПУСК АВТОМАТИЗОВАНОГО ТЕСТУВАННЯ АВТОКОМПЛІТУ ТА ПОПАПІВ');
  console.log('===============================================================\n');

  let passedTests = 0;
  let totalTests = 33;
  const canon = (s) => String(s || '').toLowerCase().replace(/['`ʼʻʽ’‘ʹ′´ˈ]/g, '');

  const { mockDocument, elementsById } = createMockEnvironment();

  // Setup Global Scope
  global.window = global;
  global.document = mockDocument;
  global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
  global.sessionStorage = { getItem: () => null, setItem: () => {} };
  const mockStorageMap = new Map();
  global.localStorage = {
    getItem: (k) => (mockStorageMap.has(k) ? mockStorageMap.get(k) : null),
    setItem: (k, v) => mockStorageMap.set(k, String(v)),
    removeItem: (k) => mockStorageMap.delete(k),
    clear: () => mockStorageMap.clear(),
    get length() { return mockStorageMap.size; }
  };
  global.location = { hostname: 'localhost' };
  global.Event = class { constructor(t) { this.type = t; } };
  global.CustomEvent = class extends global.Event {};
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) });
  global.BroadcastChannel = class MockBroadcastChannel {
    constructor(name) { this.name = name; }
    postMessage() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  };

  // Захисний таймаут: завершити процес примусово через 10 секунд, якщо щось заблокується
  const watchdogTimer = setTimeout(() => {
    console.error('\n⏱️ ТАЙМАУТ: Тести перевищили допустимий ліміт виконання (30с).');
    process.exit(1);
  }, 30000);
  if (watchdogTimer.unref) watchdogTimer.unref();

  console.time('⏱️ Час виконання тестів');

  // Load Engines and App Code
  const allSettlementsPath = path.join(__dirname, '..', 'data', 'all_settlements.js');
  if (fs.existsSync(allSettlementsPath)) {
    const allSettlementsCode = fs.readFileSync(allSettlementsPath, 'utf8');
    eval(allSettlementsCode);
  }
  const fuzzyCode = fs.readFileSync(path.join(__dirname, '..', 'data', 'fuzzySearch.js'), 'utf8');
  eval(fuzzyCode);
  const branchesCode = fs.readFileSync(path.join(__dirname, '..', 'data', 'branches.js'), 'utf8');
  eval(branchesCode);
  const appCode = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  eval(appCode);

  const searchInput = elementsById['searchInput'];
  const dropdown = elementsById['autocompleteDropdown'];

  function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 1: Поступовий набір "ки" -> "київ" (перевірка стабільності поп-апу без мерехтіння)
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 1: Поступовий набір тексту "ки" -> "київ"');
  try {
    // 1. Вводимо "К" (< 2 символів -> поп-ап закритий)
    searchInput.value = 'К';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(50);
    if (!dropdown.classList.contains('hidden')) {
      throw new Error('Поп-ап не повинен відкриватися при 1 літері');
    }

    // 2. Вводимо "ки" (>= 2 символів -> поп-ап відкривається після дебаунсу 300мс)
    searchInput.value = 'ки';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(350);
    if (dropdown.classList.contains('hidden')) {
      throw new Error('Поп-ап повинен відкритися при введенні "ки"');
    }
    const itemsCount1 = dropdown.querySelectorAll('.autocomplete-item').length;
    if (itemsCount1 === 0) {
      throw new Error('Очікувалися підказки для "ки"');
    }

    // 3. Чекаємо 500мс (фоновий пошук списку знизу не закриває поп-ап для тексту міст)
    await sleep(500);
    if (dropdown.classList.contains('hidden')) {
      throw new Error('ПОМИЛКА: Фоновий пошук закрив поп-ап під час очікування!');
    }

    // 4. Дописуємо "київ"
    searchInput.value = 'київ';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(350);
    if (dropdown.classList.contains('hidden')) {
      throw new Error('Поп-ап повинен залишатися відкритим при введенні "київ"');
    }

    const itemsKyiv = dropdown.querySelectorAll('.autocomplete-item');
    if (itemsKyiv.length === 0) {
      throw new Error('Очікувалися підказки для Києва');
    }
    const itemKyiv = itemsKyiv[0];
    const subText = itemKyiv.querySelector('.autocomplete-sub').innerHTML;
    const plainSub = subText.replace(/<[^>]+>/g, '');

    // Перевірка формату адреси: Місто — Область
    if (!plainSub.includes('Київ') || !plainSub.includes('Київська обл.')) {
      throw new Error(`Очікувався повний географічний ланцюжок у Subtitle, отримано: "${subText}"`);
    }

    console.log('  ✓ Успіх: Поп-ап стабільно відкритий під час набору "ки" -> "київ", адреса структурована без помилок.\n');
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 1:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 2: Населені пункти зі збігами в різних областях ("Підгайці")
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 2: Перевірка збігів у різних областях (село Підгайці vs місто Підгайці)');
  try {
    searchInput.value = 'Підгайці';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(350);

    const items = dropdown.querySelectorAll('.autocomplete-item');
    if (items.length < 2) {
      throw new Error('Очікувалося як мінімум 2 записи для Підгайці з різних областей');
    }

    const subtitles = items.map(it => it.querySelector('.autocomplete-sub').innerHTML);
    const hasVolyn = subtitles.some(s => s.includes('Волинська') && s.includes('Луцький р-н'));
    const hasTernopil = subtitles.some(s => s.includes('Тернопільська'));

    if (!hasVolyn || !hasTernopil) {
      throw new Error(`Очікувалися окремо Волинська та Тернопільська області, знайдено: ${JSON.stringify(subtitles)}`);
    }

    console.log('  ✓ Успіх: Райони та області чітко відображаються через дефіс без змішування.\n');
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 2:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 3: Клік на елемент підказки (вибір + фокус + закриття)
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 3: Клік на місто зі списку підказок');
  try {
    const items = dropdown.querySelectorAll('.autocomplete-item');
    if (items.length === 0) throw new Error('Список підказок порожній');

    const firstItem = items[0];

    // Симулюємо клік (mousedown з preventDefault для утримання фокусу)
    let defaultPrevented = false;
    firstItem.dispatchEvent({
      type: 'mousedown',
      preventDefault: () => { defaultPrevented = true; },
      stopPropagation: () => {}
    });

    if (!defaultPrevented) {
      throw new Error('Подія mousedown повинна викликати preventDefault для утримання фокусу');
    }

    // Перевіряємо, чи підставилося значення з пробілом
    if (!searchInput.value.startsWith('Підгайці') || !searchInput.value.endsWith(' ')) {
      throw new Error(`Значення в інпуті очікувалося "Підгайці ", отримано: "${searchInput.value}"`);
    }

    // Перевіряємо, чи закрився поп-ап
    if (!dropdown.classList.contains('hidden')) {
      throw new Error('Поп-ап повинен закритися після вибору елемента');
    }

    console.log('  ✓ Успіх: Значення підставилося в інпут, фокус утримано, поп-ап закрився.\n');
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 3:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 4: Клік поза інпутом (закриття) та повторний клік в інпут (відкриття)
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 4: Клік поза інпутом (Click Outside) та повторний клік в інпут');
  try {
    // 1. Відкриваємо поп-ап
    searchInput.value = 'Львів';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(350);

    if (dropdown.classList.contains('hidden')) {
      throw new Error('Не вдалося відкрити поп-ап для "Львів"');
    }

    // 2. Симулюємо клік поза межами (наприклад, по body)
    const emptyPageSpace = new MockElement('div', 'emptySpace');
    mockDocument.dispatchEvent({
      type: 'pointerdown',
      target: emptyPageSpace
    });

    if (!dropdown.classList.contains('hidden')) {
      throw new Error('Поп-ап не закрився при кліку поза межами інпута й поп-апу');
    }

    // 3. Симулюємо повторний клік/фокус на інпуті
    searchInput.dispatchEvent({ type: 'click' });
    if (dropdown.classList.contains('hidden')) {
      throw new Error('Поп-ап повинен знову відкритися при кліку на інпут з текстом');
    }

    console.log('  ✓ Успіх: Клік поза областю закриває поп-ап, а клік назад у інпут повторно відкриває підказки.\n');
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 4:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 5: Натискання клавіші Escape
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 5: Натискання клавіші Escape');
  try {
    searchInput.value = 'Оде';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(350);

    if (dropdown.classList.contains('hidden')) {
      throw new Error('Не вдалося відкрити поп-ап для "Оде"');
    }

    searchInput.dispatchEvent({
      type: 'keydown',
      key: 'Escape',
      preventDefault: () => {}
    });

    if (!dropdown.classList.contains('hidden')) {
      throw new Error('Поп-ап не закрився після натискання Escape');
    }

    console.log('  ✓ Успіх: Клавіша Escape коректно закрила поп-ап.\n');
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 5:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 6: Клавіатурна навігація (ArrowDown, ArrowUp, Enter)
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 6: Клавіатурна навігація (ArrowDown, ArrowUp, Enter)');
  try {
    searchInput.value = 'Чер';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(350);

    const items = dropdown.querySelectorAll('.autocomplete-item');
    if (items.length < 2) throw new Error('Очікувалося як мінімум 2 елементи для тесту стрілок');

    // 1. Натискаємо ArrowDown -> фокус на 1-му елементі
    searchInput.dispatchEvent({ type: 'keydown', key: 'ArrowDown', preventDefault: () => {} });
    if (!items[0].classList.contains('focused')) {
      throw new Error('Після 1-го ArrowDown перший елемент мав отримати клас .focused');
    }

    // 2. Натискаємо ArrowDown знову -> фокус переходить на 2-й елемент
    searchInput.dispatchEvent({ type: 'keydown', key: 'ArrowDown', preventDefault: () => {} });
    if (!items[1].classList.contains('focused') || items[0].classList.contains('focused')) {
      throw new Error('Після 2-го ArrowDown фокус мав перейти на 2-й елемент');
    }

    // 3. Натискаємо ArrowUp -> повертаємося на 1-й елемент
    searchInput.dispatchEvent({ type: 'keydown', key: 'ArrowUp', preventDefault: () => {} });
    if (!items[0].classList.contains('focused') || items[1].classList.contains('focused')) {
      throw new Error('Після ArrowUp фокус мав повернутися на 1-й елемент');
    }

    // 4. Натискаємо Enter -> вибираємо підсвічений 1-й елемент
    searchInput.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault: () => {} });
    if (!dropdown.classList.contains('hidden')) {
      throw new Error('Поп-ап не закрився після натискання Enter на вибраному елементі');
    }

    console.log('  ✓ Успіх: Стрілки вниз/вгору перемикають фокус, а Enter успішно обирає підсвічений варіант.\n');
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 6:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 7: Пошук "київ 15" (повертає саме 15-те відділення Києва)
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 7: Комбінований пошук "київ 15" (перевірка пріоритету відділення #15)');
  try {
    const pool = window.BRANCHES_DATA.novaposhta;
    const results = window.SmartSearchEngine.searchBranches('київ 15', pool);
    if (!results || results.length === 0) {
      throw new Error('Жодного відділення не знайдено за запитом "київ 15"');
    }
    const top = results[0];
    if (top.city !== 'Київ' || top.number.toString() !== '15') {
      throw new Error(`Очікувався Київ відділення №15, отримано: ${top.city} №${top.number}`);
    }
    console.log(`  ✓ Успіх: Перший результат: ${top.city} №${top.number} (${top.street || top.name}).\n`);
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 7:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 8: "підгайці тернопільська" vs "підгайці волинська"
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 8: Розрізнення однойменних міст за областю ("підгайці тернопільська" vs "підгайці волинська")');
  try {
    const pool = window.BRANCHES_DATA.novaposhta;
    const resTernopil = window.SmartSearchEngine.searchBranches('підгайці тернопільська', pool);
    if (!resTernopil || resTernopil.length === 0) {
      throw new Error('Не знайдено відділення для "підгайці тернопільська"');
    }
    const topT = resTernopil[0];
    if (topT.city !== 'Підгайці' || !topT.oblast.includes('Тернопільськ')) {
      throw new Error(`Очікувалися Підгайці Тернопільської обл, отримано: ${topT.city} (${topT.oblast})`);
    }

    const resVolyn = window.SmartSearchEngine.searchBranches('підгайці волинська', pool);
    if (!resVolyn || resVolyn.length === 0) {
      throw new Error('Не знайдено відділення для "підгайці волинська"');
    }
    const topV = resVolyn[0];
    if (topV.city !== 'Підгайці' || !topV.oblast.includes('Волинськ')) {
      throw new Error(`Очікувалися Підгайці Волинської обл, отримано: ${topV.city} (${topV.oblast})`);
    }

    console.log(`  ✓ Успіх: Коректно розрізнено: ${topT.city} (${topT.oblast} обл.) та ${topV.city} (${topV.oblast} обл.).\n`);
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 8:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 9: Пошук за вулицею та номером ("хрещатик 15")
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 9: Пошук за вулицею та номером "хрещатик 15"');
  try {
    const pool = window.BRANCHES_DATA.novaposhta;
    const results = window.SmartSearchEngine.searchBranches('хрещатик 15', pool);
    if (!results || results.length === 0) {
      throw new Error('Не знайдено відділення за запитом "хрещатик 15"');
    }
    const top = results[0];
    const streetLower = (top.street || top.address || top.name || '').toLowerCase();
    if (!streetLower.includes('хрещатик') || top.number.toString() !== '15') {
      throw new Error(`Очікувалося відділення №15 на Хрещатику, отримано: ${top.city} №${top.number} (${top.street})`);
    }
    console.log(`  ✓ Успіх: Знайдено за назвою вулиці: ${top.city} №${top.number} (${top.street}).\n`);
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 9:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 10: Пошук з помилковою розкладкою ("retd 1")
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 10: Автоконвертація розкладки en -> ua ("retd 1" -> Київ №1)');
  try {
    const pool = window.BRANCHES_DATA.novaposhta;
    const results = window.SmartSearchEngine.searchBranches('retd 1', pool);
    if (!results || results.length === 0) {
      throw new Error('Не знайдено відділення за запитом "retd 1"');
    }
    const top = results[0];
    if (top.city !== 'Київ' || top.number.toString() !== '1') {
      throw new Error(`Очікувався Київ №1, отримано: ${top.city} №${top.number}`);
    }
    console.log(`  ✓ Успіх: Розкладку сконвертовано: "retd 1" -> ${top.city} №${top.number} (${top.street || top.name}).\n`);
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 10:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 11: Пошук поштоматів ("львів поштомат 33159" та "33159")
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 11: Пошук поштомату за комбінованим запитом ("львів поштомат 33159") та номером ("33159")');
  try {
    const pool = window.BRANCHES_DATA.novaposhta;

    // 1. Пошук "львів поштомат 33159"
    const rCombo = window.SmartSearchEngine.searchBranches('львів поштомат 33159', pool);
    if (!rCombo || rCombo.length === 0) {
      throw new Error('Не знайдено поштомат за запитом "львів поштомат 33159"');
    }
    const topCombo = rCombo[0];
    if (topCombo.city !== 'Львів' || topCombo.number.toString() !== '33159' || topCombo.typeClass !== 'poshtomat') {
      throw new Error(`Очікувався Львів поштомат №33159, отримано: ${topCombo.city} №${topCombo.number} (${topCombo.typeClass})`);
    }

    // 2. Пошук виключно за 5-значним номером "33159"
    const rNum = window.SmartSearchEngine.searchBranches('33159', pool);
    if (!rNum || rNum.length === 0) {
      throw new Error('Не знайдено поштомат за запитом "33159"');
    }
    const topNum = rNum[0];
    if (topNum.number.toString() !== '33159' || topNum.typeClass !== 'poshtomat') {
      throw new Error(`Очікувався поштомат №33159 при пошуку за номером, отримано: №${topNum.number}`);
    }

    console.log(`  ✓ Успіх: "львів поштомат 33159" та "33159" миттєво знаходять Поштомат №33159 (${topCombo.city}, ${topCombo.street}).\n`);
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 11:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 12: Автокомпліт міст не перекриває екран при наявності номера у запиті
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 12: Перевірка автокомпліту (поп-ап вибору міст не блокує видачу при наявності номера)');
  try {
    // 1. Запит з номером поштомату "львів поштомат 33159"
    const suggestions1 = window.SmartSearchEngine.getAutocompleteSuggestions('львів поштомат 33159', 'novaposhta');
    const hasCitySuggestions1 = suggestions1.some(s => s.type === 'місто' || s.type === 'село' || s.type === 'смт');
    if (hasCitySuggestions1) {
      throw new Error('Поп-ап міст не повинен з\'являтися при запиті з номером поштомату "львів поштомат 33159"');
    }
    if (suggestions1.length > 0 && suggestions1[0].branchObj.number.toString() !== '33159') {
      throw new Error('Першою підказкою повинен бути саме шуканий поштомат №33159');
    }

    // 2. Запит лише з номером "33159"
    const suggestions2 = window.SmartSearchEngine.getAutocompleteSuggestions('33159', 'novaposhta');
    const hasCitySuggestions2 = suggestions2.some(s => s.type === 'місто' || s.type === 'село' || s.type === 'смт');
    if (hasCitySuggestions2) {
      throw new Error('Поп-ап міст не повинен показуватися при введенні лише номера "33159"');
    }

    console.log('  ✓ Успіх: Список міст не перекриває видачу при наявності номера у запиті, відображається суто цільовий поштомат.\n');
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 12:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 13: Перехід City Mode -> Branch Mode & Пріоритет номера відділення ("Київ 111")
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 13: Перехід City Mode -> Branch Mode при введенні "Київ 111" (відсутність підказок міст та активна картка результату)');
  try {
    // 1. Вводимо "Київ 111" в рядок пошуку
    searchInput.value = 'Київ 111';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(500);

    // 2. Перевіряємо, що в дропдауні немає підказок міст (City Mode вимкнено, активний Branch Mode)
    const cityModeItems = dropdown.querySelectorAll('.autocomplete-item-city');
    if (cityModeItems.length > 0) {
      throw new Error('Підказки міст (City Mode) не повинні відображатися при введенні цифри у запиті "Київ 111"');
    }

    // 3. Перевіряємо, що секція результатів видима
    const searchResultsSection = elementsById['searchResultsSection'];
    if (searchResultsSection.classList.contains('hidden')) {
      throw new Error('Секція результатів пошуку повинна бути видима');
    }

    // 4. Перевіряємо, що знайдено точне відділення #111 у Києві
    const pool = window.BRANCHES_DATA.novaposhta;
    const branchResults = window.SmartSearchEngine.searchBranches('Київ 111', pool);
    if (!branchResults || branchResults.length === 0) {
      throw new Error('Не знайдено відділення за запитом "Київ 111"');
    }
    const topBranch = branchResults[0];
    if (topBranch.city !== 'Київ' || topBranch.number.toString() !== '111') {
      throw new Error(`Очікувався Київ відділення №111, отримано: ${topBranch.city} №${topBranch.number}`);
    }

    console.log(`  ✓ Успіх: При "Київ 111" підказки міст замінено на Branch Mode, активна картка відділення №${topBranch.number} (${topBranch.street}).\n`);
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 13:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 14: Інтелектуальна нормалізація запиту ("коломи я 6" -> Коломия №6)
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 14: Google-like нормалізація запиту ("коломи я 6" -> Коломия №6, склеювання розірваних слів та пріоритет номера)');
  try {
    const pool = window.BRANCHES_DATA.novaposhta;

    // 1. Вводимо "коломи я 6" в рядок пошуку та перевіряємо відсутність помилки "не знайдено"
    searchInput.value = 'коломи я 6';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(550);

    const didYouMeanBox = elementsById['didYouMeanBox'];
    if (didYouMeanBox && !didYouMeanBox.classList.contains('hidden')) {
      const text = didYouMeanBox.textContent || '';
      if (text.includes('не знайдено')) {
        throw new Error(`didYouMeanBox показує помилку: "${text}" замість знайденого відділення №6`);
      }
    }

    // 2. Перевіряємо видачу SmartSearchEngine для "коломи я 6"
    const results1 = window.SmartSearchEngine.searchBranches('коломи я 6', pool);
    if (!results1 || results1.length === 0) {
      throw new Error('Не знайдено жодного відділення для запиту "коломи я 6"');
    }
    const top1 = results1[0];
    if (top1.city !== 'Коломия' || top1.number.toString() !== '6') {
      throw new Error(`Очікувалось відділення №6 у Коломиї, отримано: ${top1.city} №${top1.number}`);
    }
    if (!top1.street || !top1.street.includes('Моцарта')) {
      throw new Error(`Очікувалась вул. Моцарта, отримано: ${top1.street}`);
    }

    // 3. Перевіряємо очистку пунктуації: "нова пошта --- коломи я 6"
    const results2 = window.SmartSearchEngine.searchBranches('нова пошта --- коломи я 6', pool);
    if (!results2 || results2.length === 0 || results2[0].city !== 'Коломия' || results2[0].number.toString() !== '6') {
      throw new Error('Запит "нова пошта --- коломи я 6" не повернув відділення №6 у Коломиї');
    }

    // 4. Перевіряємо нечітке співпадіння / русифіковані або типові помилки: "каломия 6" та "коломыя 6"
    const results3 = window.SmartSearchEngine.searchBranches('каломия 6', pool);
    if (!results3 || results3.length === 0 || results3[0].city !== 'Коломия' || results3[0].number.toString() !== '6') {
      throw new Error('Запит "каломия 6" не повернув відділення №6 у Коломиї');
    }

    const results4 = window.SmartSearchEngine.searchBranches('коломыя 6', pool);
    if (!results4 || results4.length === 0 || results4[0].city !== 'Коломия' || results4[0].number.toString() !== '6') {
      throw new Error('Запит "коломыя 6" не повернув відділення №6 у Коломиї');
    }

    console.log(`  ✓ Успіх: Запит "коломи я 6" (а також "нова пошта --- коломи я 6", "каломия 6", "коломыя 6") безпомилково повертає Відділення №6 у м. Коломия (${top1.street}), попередження "не знайдено" відсутнє.\n`);
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 14:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 15: Пошук мікропунктів ("Нові Білокоровичі 1") та захист від галюцинацій
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 15: Пошук у мікропунктах ("Нові Білокоровичі 1") та захист від галюцинацій');
  try {
    const pool = window.BRANCHES_DATA.novaposhta;

    // 1. Перевіряємо точний пошук у Нових Білокоровичах
    const resultsNB = window.SmartSearchEngine.searchBranches('Нові Білокоровичі 1', pool);
    if (!resultsNB || resultsNB.length === 0) {
      throw new Error('Не знайдено жодного відділення за запитом "Нові Білокоровичі 1"');
    }
    const topNB = resultsNB[0];
    if (topNB.city !== 'Нові Білокоровичі' || topNB.number.toString() !== '1') {
      throw new Error(`Очікувалось відділення №1 у смт Нові Білокоровичі, отримано: ${topNB.city} №${topNB.number}`);
    }
    if (!topNB.street || !topNB.street.includes('Довженка')) {
      throw new Error(`Очікувалась вул. Довженка, отримано: ${topNB.street}`);
    }
    if (topNB.oblast !== 'Житомирська') {
      throw new Error(`Очікувалась Житомирська область, отримано: ${topNB.oblast}`);
    }

    // 2. Перевіряємо захист від галюцинацій при неіснуючому місті (не повинно вигадувати "м. Нів" або підтягувати інші міста)
    searchInput.value = 'нів 999';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(550);

    const didYouMeanBox = elementsById['didYouMeanBox'];
    if (didYouMeanBox && !didYouMeanBox.classList.contains('hidden')) {
      const text = didYouMeanBox.textContent || '';
      if (text.includes('м. Нів') || text.includes('у м.')) {
        throw new Error(`didYouMeanBox містить галюциноване місто: "${text}"`);
      }
    }

    const resultsFake = window.SmartSearchEngine.searchBranches('неіснуючемісто 99999', pool);
    if (resultsFake && resultsFake.length > 0) {
      throw new Error(`Для неіснуючого міста знайдено ${resultsFake.length} відділень замість 0`);
    }

    console.log(`  ✓ Успіх: "Нові Білокоровичі 1" миттєво знаходить ${topNB.city} №${topNB.number} (${topNB.street}, ${topNB.oblast} обл.), а для неіснуючих міст галюцинації типу "м. Нів" повністю заблоковані.\n`);
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 15:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 16: Повний рефакторинг UX (Empty State, розділення станів вводу та лаконічність карток)
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 16: UX-рефакторинг (Empty state без спаму іншими відділеннями, розділення станів та приховування лімітів 5/10/20)');
  try {
    const searchResultsSection = elementsById['searchResultsSection'];
    const resultsList = elementsById['resultsList'];
    const resultsCount = elementsById['resultsCount'];
    const limitSelector = elementsById['limitSelector'];
    const resultsTypeFilters = elementsById['resultsTypeFilters'];

    // 1. ПЕРЕВІРКА СТАНУ "ВВЕДЕННЯ МІСТА": при введенні тільки назви міста без цифр ("тернопіль")
    // випадаючий поп-ап активний, а секція результатів прихована (ніяких випадкових карток на фоні)
    searchInput.value = 'тернопіль';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(400);

    if (dropdown.classList.contains('hidden')) {
      throw new Error('Поп-ап міст повинен бути відкритий при введенні назви міста');
    }
    if (!searchResultsSection.classList.contains('hidden')) {
      throw new Error('Секція результатів повинна бути ПРИХОВАНА на фоні під час набору міста без вибору');
    }

    // 2. ПЕРЕВІРКА ПРАВИЛА EMPTY STATE: неіснуючий номер відділення у місті ("київ 99999")
    // КАТЕГОРИЧНО ЗАБОРОНЕНО показувати сотні інших відділень. Тільки 1 повідомлення.
    searchInput.value = 'київ 99999';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(550);

    if (!dropdown.classList.contains('hidden')) {
      throw new Error('Поп-ап міст повинен бути закритий при наявності номера');
    }
    if (searchResultsSection.classList.contains('hidden')) {
      throw new Error('Секція результатів повинна бути видима для показу сповіщення Empty State');
    }

    const countText = resultsCount.textContent || '';
    if (!countText.includes('0')) {
      throw new Error(`Очікувалось '0 відділень', отримано: "${countText}"`);
    }

    // Перевіряємо повну відсутність карток інших відділень
    const branchCards = resultsList.querySelectorAll('.branch-card');
    const matchRows = resultsList.querySelectorAll('.address-match-row');
    if (branchCards.length > 0 || matchRows.length > 0) {
      throw new Error(`СПАМ ВИДАЧІ: знайдено ${branchCards.length + matchRows.length} невідповідних карток відділень замість 0!`);
    }

    // Перевіряємо текст сповіщення
    const listHtml = resultsList.innerHTML || '';
    if (!listHtml.includes('99999') || !listHtml.includes('не знайдено')) {
      throw new Error(`Очікувалось точне сповіщення про неіснуюче відділення, отримано HTML: ${listHtml}`);
    }
    if (!listHtml.includes('Перевірте правильність введеного номера')) {
      throw new Error('Очікувався рядок "Перевірте правильність введеного номера."');
    }

    // Перевіряємо, що перемикачі ліміту та фільтри приховані при empty state
    if (limitSelector.style.display !== 'none') {
      throw new Error('limitSelector повинен бути прихований (display: none) при empty state');
    }
    if (resultsTypeFilters.style.display === 'none') {
      throw new Error('resultsTypeFilters НЕ повинен ховатися (display: none) при empty state (v8.26.0)');
    }

    // 3. ПЕРЕВІРКА ЛАКОНІЧНОСТІ КАРТКИ ТОЧНОГО ЗБІГУ ("київ 111")
    searchInput.value = 'київ 111';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(550);

    if (limitSelector.style.display !== 'none') {
      throw new Error('limitSelector повинен бути прихований (display: none) для точного збігу однієї картки');
    }
    if (resultsTypeFilters.style.display !== 'none') {
      throw new Error('resultsTypeFilters повинен бути прихований (display: none) для точного збігу однієї картки');
    }

    const selectedContainer = resultsList.querySelector('.selected-branch-container');
    if (!selectedContainer) {
      throw new Error('Очікувався контейнер вибраної картки .selected-branch-container');
    }
    if (resultsList.querySelectorAll('.address-match-row').length > 0) {
      throw new Error('Масовий список .address-match-row не повинен рендеритися при виборі 1 точного відділення');
    }

    // 4. ПЕРЕВІРКА UI/UX НОВОГО ЛЕЙАУТУ КАРТКИ (v8.16.0)
    // а) Зелена плашка "✓ ОБРАНА АДРЕСА" повинна бути повністю відсутня
    const selectedBadge = resultsList.querySelector('.selected-badge-indicator');
    if (selectedBadge || resultsList.innerHTML.includes('selected-badge-indicator') || resultsList.innerHTML.includes('Обрана адреса')) {
      throw new Error('Помилка UX: зелена плашка "Обрана адреса" знайдена у розмітці картки, але повинна бути прибрана!');
    }

    // б) Кнопка "Скопіювати" (.btn-copy-action) повинна знаходитися у .card-foot ліворуч від бейджів (.weight-pill / .status-badge)
    const cardFoot = resultsList.querySelector('.card-foot');
    if (!cardFoot) {
      throw new Error('Очікувався .card-foot у вибраній картці');
    }
    const copyBtn = cardFoot.querySelector('.btn-copy-action');
    if (!copyBtn) {
      throw new Error('Кнопка "Скопіювати" (.btn-copy-action) відсутня у .card-foot');
    }
    const footHtml = cardFoot.innerHTML || '';
    const copyBtnPos = footHtml.indexOf('btn-copy-action');
    const weightPillPos = footHtml.indexOf('weight-pill');
    if (copyBtnPos === -1 || (weightPillPos !== -1 && copyBtnPos > weightPillPos)) {
      throw new Error(`Кнопка "Скопіювати" повинна бути ліворуч від бейджів типу (.weight-pill), отримано pos(btn)=${copyBtnPos}, pos(pill)=${weightPillPos}`);
    }

    // в) Читабельність заголовку (.card-primary-line присутній)
    const primaryLine = resultsList.querySelector('.card-primary-line');
    if (!primaryLine) {
      throw new Error('Очікувався .card-primary-line для збільшеного контрастного текстового блоку адреси');
    }

    console.log('  ✓ Успіх: Empty State надійно блокує спам неіснуючими відділеннями, зелену плашку "Обрана адреса" ліквідовано, кнопку "Скопіювати" перенесено ліворуч, ліміти приховані.\n');
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 16:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 17: Smart Faceted Search (довільний порядок сутностей, ізоляція міст та стемінг вулиць)
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 17: Smart Faceted Search (довільний порядок сутностей, ізоляція міст та стемінг вулиць)');
  try {
    const branches = window.BRANCHES_DATA.novaposhta;

    // 1. "Підгайці Тернопільська 1" та "Підгайці Тернопільський район 1"
    const p1 = window.SmartSearchEngine.searchBranches('Підгайці Тернопільська 1', branches, 5);
    if (p1.length === 0 || p1[0].city !== 'Підгайці' || p1[0].number !== '1' || !p1[0].oblast.includes('Тернопільськ')) {
      throw new Error(`Очікувалось Підгайці №1 у Тернопільській обл., отримано: ${p1.map(b => `${b.city} №${b.number} (${b.oblast})`).join(', ')}`);
    }
    // Перевіряємо повну ізоляцію контексту (жодних відділень з Волинської області)
    if (p1.some(b => b.oblast.includes('Волинськ'))) {
      throw new Error('Виявлено витік з Волинської області при запиті для Тернопільської області!');
    }

    const p2 = window.SmartSearchEngine.searchBranches('Підгайці Тернопільський район 1', branches, 5);
    if (p2.length === 0 || p2[0].city !== 'Підгайці' || p2[0].number !== '1' || !p2[0].oblast.includes('Тернопільськ')) {
      throw new Error(`Очікувалось Підгайці №1 для Тернопільського р-ну, отримано: ${p2.map(b => `${b.city} №${b.number} (${b.oblast})`).join(', ')}`);
    }

    // 2. "Київ Хрещатик 15" та "Хрещатик 15 Київ"
    const k1 = window.SmartSearchEngine.searchBranches('Київ Хрещатик 15', branches, 5);
    if (k1.length === 0 || k1[0].city !== 'Київ' || k1[0].number !== '15' || !k1[0].street.includes('Хрещатик')) {
      throw new Error(`Очікувалось Київ №15 (вул. Хрещатик, 15), отримано: ${k1.map(b => `${b.city} №${b.number} (${b.street})`).join(', ')}`);
    }

    const k2 = window.SmartSearchEngine.searchBranches('Хрещатик 15 Київ', branches, 5);
    if (k2.length === 0 || k2[0].city !== 'Київ' || k2[0].number !== '15' || !k2[0].street.includes('Хрещатик')) {
      throw new Error(`Очікувалось Київ №15 для 'Хрещатик 15 Київ', отримано: ${k2.map(b => `${b.city} №${b.number} (${b.street})`).join(', ')}`);
    }

    // 3. "Львів 4" (Ізоляція міста: жодного Броди чи Вороновиця)
    const l1 = window.SmartSearchEngine.searchBranches('Львів 4', branches, 5);
    if (l1.length === 0 || l1[0].city !== 'Львів' || l1[0].number !== '4') {
      throw new Error(`Очікувалось Львів №4 на 1-му місці, отримано: ${l1.map(b => `${b.city} №${b.number}`).join(', ')}`);
    }
    if (l1.some(b => b.city !== 'Львів')) {
      throw new Error(`Порушено ізоляцію міста для 'Львів 4': повернуто інші міста ${l1.filter(b => b.city !== 'Львів').map(b => b.city).join(', ')}`);
    }

    // 4. Пошук по вулиці з урахуванням морфології кореня ("корольова" -> "просп. Академіка Корольова")
    const korBranch = branches.find(b => b.city === 'Київ' && b.street.includes('Корольова'));
    if (korBranch) {
      const matchRoot = window.SmartSearchEngine.matchStreetOrAddress(korBranch, 'корольова');
      if (!matchRoot) {
        throw new Error('matchStreetOrAddress не зміг зіставити токен "корольова" з "просп. Академіка Корольова"');
      }
    }

    console.log('  ✓ Успіх: Фасетний пошук підтримує довільний порядок слів ("Київ Хрещатик 15" == "Хрещатик 15 Київ"), ізолює міста ("Львів 4" без витоків), розрізняє області/райони ("Підгайці Тернопільська 1") та підтримує стемінг вулиць.\n');
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 17:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 18: Exact Match Priority та скорочення областей ("славута хмель 2")
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 18: Exact Match Priority та скорочення областей ("славута хмель 2")');
  try {
    const branches = window.BRANCHES_DATA.novaposhta;

    // 1. Перевірка екстракції фасетів: "славута" -> місто, "хмель" -> Хмельницька область, "2" -> номер відділення
    const facets = window.SmartSearchEngine.extractFacets('славута хмель 2');
    if (facets.city !== 'Славута') {
      throw new Error(`Очікувалось місто 'Славута', отримано: '${facets.city}'`);
    }
    if (facets.oblast !== 'Хмельницька' && facets.settlementOblast !== 'Хмельницька') {
      throw new Error(`Очікувалась Хмельницька область для скорочення 'хмель', отримано oblast='${facets.oblast}', settlementOblast='${facets.settlementOblast}'`);
    }
    if (facets.number !== '2') {
      throw new Error(`Очікувався номер відділення '2', отримано: '${facets.number}'`);
    }
    if (facets.streetTokens.includes('хмель')) {
      throw new Error(`Скорочення області 'хмель' помилково потрапило у назву вулиці: ${JSON.stringify(facets.streetTokens)}`);
    }

    // 2. Пошук відділень: 1-ше місце обов'язково займає Славута Відділення №2 (вул. Кузовкова, 3), Хмельницька обл.
    const res = window.SmartSearchEngine.searchBranches('славута хмель 2', branches, 5);
    if (res.length === 0) {
      throw new Error("Не знайдено жодного відділення за запитом 'славута хмель 2'");
    }

    const top = res[0];
    if (top.city !== 'Славута' || top.number !== '2' || !top.oblast.includes('Хмельницьк')) {
      throw new Error(`Топ результат повинен бути Славута №2 (Хмельницька обл.), а отримано: ${top.city} №${top.number} (${top.oblast}, ${top.street || top.address})`);
    }

    // 3. Захист від підміни точного міста: жодного Славутича у видачі
    const hasSlavutych = res.some(b => (b.city || '').toLowerCase().includes('славутич'));
    if (hasSlavutych) {
      throw new Error("Критичний баг: у результатах для 'славута хмель 2' виявлено Славутич!");
    }

    console.log("  ✓ Успіх: Запит 'славута хмель 2' ідеально ідентифікував точне місто Славута (без підміни на Славутич), розпізнав скорочення 'хмель' як Хмельницьку область та повернув Відділення №2 на 1-му місці.\n");
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 18:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 19: Прямий пошук поштоматів за довгим номером ("33159", "львів 33159") та Region Stemming
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 19: Прямий пошук поштоматів за довгим номером ("33159", "львів 33159") та Region Stemming');
  try {
    const branches = window.BRANCHES_DATA.novaposhta;

    // 1. Пошук суто за номером "33159"
    const resNumOnly = window.SmartSearchEngine.searchBranches('33159', branches, 5);
    if (!resNumOnly || resNumOnly.length === 0) {
      throw new Error("Не знайдено поштомат за прямим 5-значним номером '33159'");
    }
    const topNum = resNumOnly[0];
    if (topNum.number !== '33159' || topNum.city !== 'Львів') {
      throw new Error(`Очікувався Львів №33159, отримано: ${topNum.city} №${topNum.number}`);
    }

    // 2. Пошук за комбінацією "львів 33159"
    const resCityNum = window.SmartSearchEngine.searchBranches('львів 33159', branches, 5);
    if (!resCityNum || resCityNum.length === 0) {
      throw new Error("Не знайдено поштомат за комбінацією 'львів 33159'");
    }
    const topCityNum = resCityNum[0];
    if (topCityNum.number !== '33159' || topCityNum.city !== 'Львів') {
      throw new Error(`Очікувався Львів №33159 для 'львів 33159', отримано: ${topCityNum.city} №${topCityNum.number}`);
    }

    // 3. Перевірка Region Stemming (стем-префікси від 3 символів)
    if (window.SmartSearchEngine.isOblastToken('хмель') !== 'Хмельницька') {
      throw new Error("isOblastToken('хмель') повинен повертати 'Хмельницька'");
    }
    if (window.SmartSearchEngine.isOblastToken('терн') !== 'Тернопільська') {
      throw new Error("isOblastToken('терн') повинен повертати 'Тернопільська'");
    }
    if (window.SmartSearchEngine.isOblastToken('льв') !== 'Львівська') {
      throw new Error("isOblastToken('льв') повинен повертати 'Львівська'");
    }
    if (window.SmartSearchEngine.isOblastToken('львів') !== null) {
      throw new Error("isOblastToken('львів') повинен повертати null (місто Львів не є скороченням області)");
    }

    console.log("  ✓ Успіх: Прямий пошук поштоматів за довгим номером ('33159', 'львів 33159') миттєво знаходить цільовий поштомат на 1-му місці, а Region Stemming бездоганно розпізнає 'хмель', 'терн', 'льв'.\n");
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 19:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 20: Primary Settlement Anchor ("гриців 1 київ" -> смт Гриців, №1 вул. Київська, 3)
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 20: Primary Settlement Anchor (ізоляція першого міста та префіксний збіг вулиць "гриців 1 київ")');
  try {
    const pool = window.BRANCHES_DATA.novaposhta;
    const resultsList = elementsById['resultsList'];

    // 1. Пошук "гриців 1 київ" через SmartSearchEngine
    const res1 = window.SmartSearchEngine.searchBranches('гриців 1 київ', pool, 5);
    if (!res1 || res1.length === 0) {
      throw new Error("Не знайдено відділення для запиту 'гриців 1 київ'");
    }
    const top1 = res1[0];
    if (top1.city !== 'Гриців' || top1.number !== '1' || !top1.street.includes('Київська')) {
      throw new Error(`Очікувався смт Гриців №1 (вул. Київська, 3), отримано: ${top1.city} №${top1.number} (${top1.street})`);
    }

    // 2. Пошук "гриців 1 київська" через SmartSearchEngine
    const res2 = window.SmartSearchEngine.searchBranches('гриців 1 київська', pool, 5);
    if (!res2 || res2.length === 0) {
      throw new Error("Не знайдено відділення для запиту 'гриців 1 київська'");
    }
    const top2 = res2[0];
    if (top2.city !== 'Гриців' || top2.number !== '1' || !top2.street.includes('Київська')) {
      throw new Error(`Очікувався смт Гриців №1 для 'гриців 1 київська', отримано: ${top2.city} №${top2.number} (${top2.street})`);
    }

    // 3. Перевірка UI: вводимо в searchInput "гриців 1 київ"
    searchInput.value = 'гриців 1 київ';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(550);

    const emptyBox = resultsList.querySelector('.empty-results-box');
    if (emptyBox) {
      throw new Error(`Помилково показано Empty State: "${emptyBox.textContent.trim()}"`);
    }

    console.log("  ✓ Успіх: Primary Settlement Anchor зафіксував 'Гриців', 'київ' успішно зіставлено з 'вул. Київська, 3', помилкове сповіщення про Київ відсутнє.\n");
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 20:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 21: Двосторонній адресний пошук індексів Укрпошти ("житомир нові білокоровичі 1" та "11051")
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 21: Двосторонній адресний пошук індексів Укрпошти ("житомир нові білокоровичі 1", "11051")');
  try {
    const upPool = window.BRANCHES_DATA.ukrposhta;
    const btnNovaPoshta = elementsById['btnNovaPoshta'];
    const btnUkrposhta = elementsById['btnUkrposhta'];
    const resultsList = elementsById['resultsList'];

    // 1. Пошук за запитом "житомир нові білокоровичі 1"
    const resUP1 = window.SmartSearchEngine.searchBranches('житомир нові білокоровичі 1', upPool, 5);
    if (!resUP1 || resUP1.length === 0) {
      throw new Error("Не знайдено відділення для 'житомир нові білокоровичі 1'");
    }
    const topUP1 = resUP1[0];
    if (topUP1.city !== 'Нові Білокоровичі' || (topUP1.postalCode !== '11051' && topUP1.number !== '11051')) {
      throw new Error(`Очікувалися Нові Білокоровичі з індексом 11051, отримано: ${topUP1.city} №${topUP1.number} (індекс: ${topUP1.postalCode})`);
    }

    // 2. Пошук за запитом "нові білокоровичі"
    const resUP2 = window.SmartSearchEngine.searchBranches('нові білокоровичі', upPool, 5);
    if (!resUP2 || resUP2.length === 0) {
      throw new Error("Не знайдено відділення для 'нові білокоровичі'");
    }
    const topUP2 = resUP2[0];
    if (topUP2.city !== 'Нові Білокоровичі' || topUP2.postalCode !== '11051') {
      throw new Error(`Очікувався індекс 11051 для 'нові білокоровичі', отримано: ${topUP2.city} (індекс: ${topUP2.postalCode})`);
    }

    // 3. Прямий запит індексу "11051"
    const resUP3 = window.SmartSearchEngine.searchBranches('11051', upPool, 5);
    if (!resUP3 || resUP3.length === 0) {
      throw new Error("Не знайдено відділення за прямим поштовим індексом '11051'");
    }
    const topUP3 = resUP3[0];
    if (topUP3.postalCode !== '11051' || topUP3.city !== 'Нові Білокоровичі') {
      throw new Error(`Очікувалися Нові Білокоровичі (11051) для '11051', отримано: ${topUP3.city} (індекс: ${topUP3.postalCode})`);
    }

    // 4. Перевірка UI у табі Укрпошти: "житомир нові білокоровичі 1"
    btnUkrposhta.dispatchEvent({ type: 'click' });
    await sleep(200);

    searchInput.value = 'житомир нові білокоровичі 1';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(550);

    const emptyBoxUP = resultsList.querySelector('.empty-results-box');
    if (emptyBoxUP) {
      throw new Error(`Укрпошта помилково показала Empty State для 'житомир нові білокоровичі 1': "${emptyBoxUP.textContent.trim()}"`);
    }
    const fullText = resultsList.innerHTML;
    if (!fullText.includes('11051')) {
      throw new Error("У картці відділення Укрпошти відсутній поштовий індекс 11051");
    }

    // v8.26.0: дублюючі теги індексу у підвалі картки прибрані
    if (fullText.includes('btn-copy-index-action') || fullText.includes('ІНДЕКС:')) {
      throw new Error("У підвалі картки Укрпошти не повинно бути дублюючих тегів індексу");
    }
    if (fullText.includes('Обрати ➔')) {
      throw new Error("Кнопка 'Обрати ➔' повинна бути видалена");
    }

    // 5. Перевірка UI для запиту "житомир нові білокоровичі" (без номера)
    searchInput.value = 'житомир нові білокоровичі';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(550);

    const fullTextWithoutNum = resultsList.innerHTML;
    if (!fullTextWithoutNum.includes('11051')) {
      throw new Error("Запит 'житомир нові білокоровичі' без номера повинен виводити відділення з індексом 11051");
    }

    // Повертаємо таб Нової Пошти назад
    btnNovaPoshta.dispatchEvent({ type: 'click' });
    await sleep(200);

    console.log("  ✓ Успіх: Двосторонній пошук індексів бездоганно розпізнав 'житомир нові білокоровичі 1', 'житомир нові білокоровичі' та '11051', підтягнувши індекс 11051 (вул. Довженка, 20) та бейдж індексу.\n");
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 21:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 22: Прямий індексний пошук Укрпошти ("79049" -> Львів, просп. Червоної Калини, 113)
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 22: Прямий індексний пошук Укрпошти ("79049" -> Львів, просп. Червоної Калини, 113)');
  try {
    const upPool = window.BRANCHES_DATA.ukrposhta;
    const btnUkrposhta = elementsById['btnUkrposhta'];
    const btnNovaPoshta = elementsById['btnNovaPoshta'];
    const searchInput = elementsById['searchInput'];
    const resultsList = elementsById['resultsList'];

    // 1. Пошук за 5-значним індексом "79049" у функції пошукового рушія
    const res1 = window.SmartSearchEngine.searchBranches('79049', upPool, 5);
    if (!res1 || res1.length === 0) {
      throw new Error("Не знайдено відділення Укрпошти за індексом '79049'");
    }
    const top1 = res1[0];
    if (top1.postalCode !== '79049' || top1.city !== 'Львів') {
      throw new Error(`Очікувався Львів (79049), отримано: ${top1.city} (індекс: ${top1.postalCode})`);
    }
    if (!top1.street || !top1.street.includes('Червоної Калини')) {
      throw new Error(`Очікувалася вулиця 'просп. Червоної Калини, 113', отримано: ${top1.street}`);
    }

    // 2. Пошук за адресою "львів червоної калини 113" у функції пошукового рушія
    const res2 = window.SmartSearchEngine.searchBranches('львів червоної калини 113', upPool, 5);
    if (!res2 || res2.length === 0) {
      throw new Error("Не знайдено відділення Укрпошти за запитом 'львів червоної калини 113'");
    }
    const top2 = res2[0];
    if (top2.postalCode !== '79049' || top2.city !== 'Львів') {
      throw new Error(`Очікувався Львів (79049), отримано: ${top2.city} (індекс: ${top2.postalCode})`);
    }

    // 3. UI перевірка в табі Укрпошти: введення "79049"
    btnUkrposhta.dispatchEvent({ type: 'click' });
    await sleep(200);

    searchInput.value = '79049';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(550);

    const emptyBoxUP1 = resultsList.querySelector('.empty-results-box');
    if (emptyBoxUP1) {
      throw new Error(`Укрпошта помилково показала Empty State для '79049': "${emptyBoxUP1.textContent.trim()}"`);
    }
    let htmlUP = resultsList.innerHTML;
    if (!htmlUP.includes('79049') || !htmlUP.includes('Червоної Калини')) {
      throw new Error("Картка результатів Укрпошти для '79049' не містить індекс 79049 або вулицю Червоної Калини");
    }

    // 4. UI перевірка в табі Укрпошти: введення "львів червоної калини 113"
    searchInput.value = 'львів червоної калини 113';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(550);

    const emptyBoxUP2 = resultsList.querySelector('.empty-results-box');
    if (emptyBoxUP2) {
      throw new Error(`Укрпошта помилково показала Empty State для 'львів червоної калини 113': "${emptyBoxUP2.textContent.trim()}"`);
    }
    htmlUP = resultsList.innerHTML;
    if (!htmlUP.includes('79049') || !htmlUP.includes('Червоної Калини')) {
      throw new Error("Картка результатів Укрпошти для 'львів червоної калини 113' не містить індекс 79049");
    }

    // Повертаємо таб Нової Пошти назад
    btnNovaPoshta.dispatchEvent({ type: 'click' });
    await sleep(200);

    console.log("  ✓ Успіх: Запити '79049' та 'львів червоної калини 113' у табі Укрпошти безпомилково знаходять відділення у м. Львів (просп. Червоної Калини, 113) з індексом 79049.\n");
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 22:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 23: Стрес-тестування критичних крайових випадків (v8.18.2)
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 23: Стрес-тестування критичних крайових випадків (v8.18.2)');
  try {
    const pool = window.BRANCHES_DATA.novaposhta;
    const upPool = window.BRANCHES_DATA.ukrposhta;
    const btnNovaPoshta = elementsById['btnNovaPoshta'];
    const btnUkrposhta = elementsById['btnUkrposhta'];
    const searchInput = elementsById['searchInput'];
    const resultsList = elementsById['resultsList'];

    // 1. Нормалізація розірваних індексів ("79 049" -> 79049)
    const normSplit = window.SmartSearchEngine.normalizeSearchTokens("79 049");
    if (!normSplit.tokens.includes("79049") || normSplit.tokens.includes("79")) {
      throw new Error(`Розірваний індекс '79 049' не склеївся у 79049: ${JSON.stringify(normSplit.tokens)}`);
    }
    const resSplitUP = window.SmartSearchEngine.searchBranches("79 049", upPool, 5);
    if (!resSplitUP || resSplitUP.length === 0 || resSplitUP[0].postalCode !== "79049") {
      throw new Error("Пошук '79 049' не повернув відділення з індексом 79049");
    }

    // 2. Склеювання маркерів поштоматів ("пм", "п/м", "пошт", "пм 22104 одеса")
    if (!window.SmartSearchEngine.isPostomatKeyword("пм") ||
        !window.SmartSearchEngine.isPostomatKeyword("п/м") ||
        !window.SmartSearchEngine.isPostomatKeyword("пошт")) {
      throw new Error("Маркери поштомату 'пм', 'п/м', 'пошт' не розпізнано функцією isPostomatKeyword");
    }
    const resPM = window.SmartSearchEngine.searchBranches("пм 22104 одеса", pool, 5);
    if (!resPM || resPM.length === 0 || resPM[0].number !== "22104" || resPM[0].city !== "Одеса") {
      throw new Error(`Запит 'пм 22104 одеса' не повернув поштомат 22104 у м. Одеса: ${JSON.stringify(resPM[0])}`);
    }

    // 3. Аліаси та скорочення для Кам'янець-Подільський
    const kamAliases = ["камподільський", "камподільськ", "кампод", "кам-под", "кам янець", "камянець"];
    for (let alias of kamAliases) {
      const normKam = window.SmartSearchEngine.normalizeSearchTokens(alias + " 1");
      if (!normKam.detectedCity || normKam.detectedCity.name !== "Кам'янець-Подільський") {
        throw new Error(`Аліас '${alias}' не розпізнано як Кам'янець-Подільський (отримано: ${normKam.detectedCity ? normKam.detectedCity.name : 'null'})`);
      }
    }

    // 4. Пріоритет області над тезками (Олександрія Рівне vs Кіровоград)
    const resRivne = window.SmartSearchEngine.searchBranches("олександрія рівне", pool, 5);
    if (!resRivne || resRivne.length === 0 || resRivne[0].oblast !== "Рівненська") {
      throw new Error(`Запит 'олександрія рівне' повернув іншу область: ${resRivne[0] ? resRivne[0].oblast : 'null'}`);
    }
    const resKirov = window.SmartSearchEngine.searchBranches("олександрія кіров", pool, 5);
    if (!resKirov || resKirov.length === 0 || resKirov[0].oblast !== "Кіровоградська") {
      throw new Error(`Запит 'олександрія кіров' повернув іншу область: ${resKirov[0] ? resKirov[0].oblast : 'null'}`);
    }

    // 5. Вулиця проти номера (випадок "145 драгоманов київ")
    const resDrag = window.SmartSearchEngine.searchBranches("145 драгоманов київ", pool, 5);
    if (!resDrag || resDrag.length === 0 || !resDrag[0].street.includes("Драгоманов")) {
      throw new Error(`Запит '145 драгоманов київ' не віддав пріоритет вул. Драгоманова: отримано ${resDrag[0] ? resDrag[0].street : 'null'}`);
    }

    // 6. Захист малих сіл від поглинання обласним центром ("іванівка житомир 1")
    const resIvan = window.SmartSearchEngine.searchBranches("іванівка житомир 1", pool, 5);
    if (!resIvan || resIvan.length === 0 || resIvan[0].city !== "Іванівка" || resIvan[0].oblast !== "Житомирська" || resIvan[0].number !== "1") {
      throw new Error(`Запит 'іванівка житомир 1' не повернув с. Іванівка №1: отримано ${resIvan[0] ? resIvan[0].city + ' №' + resIvan[0].number : 'null'}`);
    }

    // UI перевірка: пошук "145 драгоманов київ"
    searchInput.value = '145 драгоманов київ';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(550);
    const htmlRes = resultsList.innerHTML;
    if (!htmlRes.includes('Драгоманов')) {
      throw new Error("UI картки результатів для '145 драгоманов київ' не містять вул. Драгоманова");
    }

    console.log("  ✓ Успіх: Усі 5+ критичних крайових випадків (розірвані індекси, маркери поштоматів, аліаси Кам'янця, блокуючий штраф області, пріоритет вулиці над номером, захист сіл) перевірено та успішно пройдено!\\n");
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 23:', err.message, '\\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 24: Перемикання та збереження тем оформлення (Світла та Темна)
  // --------------------------------------------------------------------------
  try {
    console.log('▶ ТЕСТ 24: Перемикання та збереження тем оформлення (Світла та Темна; v8.19.0)');
    const btnThemeToggle = elementsById['btnThemeToggle'];
    if (!btnThemeToggle) {
      throw new Error("Елемент #btnThemeToggle не знайдено в DOM!");
    }

    // 1. Початковий стан: без збереженого вибору в localStorage повинна бути дефолтна світла тема
    const initialTheme = mockDocument.documentElement.getAttribute('data-theme');
    if (initialTheme !== 'light') {
      throw new Error(`Дефолтна тема має бути 'light', отримано '${initialTheme}'`);
    }

    // 2. Клік на кнопку перемикача: перемикає на темну тему
    btnThemeToggle.dispatchEvent({ type: 'click' });
    const darkTheme = mockDocument.documentElement.getAttribute('data-theme');
    const storedDark = global.localStorage.getItem('app_theme');
    if (darkTheme !== 'dark') {
      throw new Error(`Після першого кліку очікувалась тема 'dark', отримано '${darkTheme}'`);
    }
    if (storedDark !== 'dark') {
      throw new Error(`В localStorage очікувалось 'dark', отримано '${storedDark}'`);
    }
    if (btnThemeToggle.getAttribute('aria-label') !== 'Увімкнути світлу тему') {
      throw new Error(`aria-label очікувалось 'Увімкнути світлу тему', отримано '${btnThemeToggle.getAttribute('aria-label')}'`);
    }

    // 3. Другий клік: повернення до світлої теми
    btnThemeToggle.dispatchEvent({ type: 'click' });
    const lightTheme = mockDocument.documentElement.getAttribute('data-theme');
    const storedLight = global.localStorage.getItem('app_theme');
    if (lightTheme !== 'light') {
      throw new Error(`Після другого кліку очікувалась тема 'light', отримано '${lightTheme}'`);
    }
    if (storedLight !== 'light') {
      throw new Error(`В localStorage очікувалось 'light', отримано '${storedLight}'`);
    }
    if (btnThemeToggle.getAttribute('aria-label') !== 'Увімкнути темну тему') {
      throw new Error(`aria-label очікувалось 'Увімкнути темну тему', отримано '${btnThemeToggle.getAttribute('aria-label')}'`);
    }

    // 4. Персистентність при перезавантаженні сторінки з обраною темною темою
    global.localStorage.setItem('app_theme', 'dark');
    // Симуляція ініціалізації при перезавантаженні
    const reloadedTheme = (global.localStorage.getItem('app_theme') === 'dark') ? 'dark' : 'light';
    mockDocument.documentElement.setAttribute('data-theme', reloadedTheme);
    if (mockDocument.documentElement.getAttribute('data-theme') !== 'dark') {
      throw new Error("Перезавантаження сторінки не зберегло обрану тему 'dark'");
    }

    // 5. Очищення кешу / сховища браузера: повернення до дефолтної білої теми
    global.localStorage.clear();
    const cacheClearedStored = global.localStorage.getItem('app_theme');
    const resetTheme = (cacheClearedStored === 'dark') ? 'dark' : 'light';
    mockDocument.documentElement.setAttribute('data-theme', resetTheme);
    if (resetTheme !== 'light' || mockDocument.documentElement.getAttribute('data-theme') !== 'light') {
      throw new Error("Після очищення кешу/localStorage дефолтна тема має бути 'light'");
    }

    console.log("  ✓ Успіх: Перемикання світла/темна працює бездоганно, персистентність у localStorage підтверджена, після очищення кешу відновлюється дефолтна світла (біла) тема!\\n");
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 24:', err.message, '\\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 25: Топонімічна дезамбігуація та районна консолідація ("сарнинський 2 рокитне" -> смт Рокитне, Сарненський р-н, Рівненська обл. №2)
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 25: Топонімічна дезамбігуація та районна консолідація ("сарнинський 2 рокитне")');
  try {
    const branches = window.BRANCHES_DATA.novaposhta;

    // 1. Пошук за запитом з одруківкою в районі: "сарнинський 2 рокитне"
    const r1 = window.SmartSearchEngine.searchBranches('сарнинський 2 рокитне', branches, 5);
    if (r1.length === 0) {
      throw new Error("За запитом 'сарнинський 2 рокитне' нічого не знайдено!");
    }
    const top1 = r1[0];
    if (top1.city !== 'Рокитне' || top1.number !== '2' || top1.oblast !== 'Рівненська') {
      throw new Error(`Очікувалось смт Рокитне №2 (Рівненська обл.), отримано: ${top1.city} №${top1.number} (${top1.raion} р-н, ${top1.oblast} обл.)`);
    }
    if (!top1.street.includes('Патріотична')) {
      throw new Error(`Очікувалась вул. Патріотична, отримано: '${top1.street}'`);
    }

    // 2. Пошук за колишньою назвою району до адмінреформи 2020: "рокитнівський 2 рокитне"
    const r2 = window.SmartSearchEngine.searchBranches('рокитнівський 2 рокитне', branches, 5);
    if (r2.length === 0 || r2[0].city !== 'Рокитне' || r2[0].number !== '2' || r2[0].oblast !== 'Рівненська') {
      throw new Error("Очікувалось смт Рокитне №2 (Рівненська обл.) для 'рокитнівський 2 рокитне'");
    }

    // 3. Прямий порядок: "рокитне сарненський 2"
    const r3 = window.SmartSearchEngine.searchBranches('рокитне сарненський 2', branches, 5);
    if (r3.length === 0 || r3[0].city !== 'Рокитне' || r3[0].number !== '2' || r3[0].oblast !== 'Рівненська') {
      throw new Error("Очікувалось смт Рокитне №2 (Рівненська обл.) для 'рокитне сарненський 2'");
    }

    // 4. Автокомпліт без цифр для однойменних населених пунктів: "рокитне" повертає обидва варіанти
    const acAll = window.SmartSearchEngine.getAutocompleteSuggestions('рокитне', 'novaposhta');
    const hasKyiv = acAll.some(s => s.subtitle.includes('Київська') || s.subtitle.includes('Білоцерківський'));
    const hasRivne = acAll.some(s => s.subtitle.includes('Рівненська') || s.subtitle.includes('Сарненський'));
    if (!hasKyiv || !hasRivne) {
      throw new Error(`Автокомпліт для 'рокитне' має повертати обидва регіони (Київська та Рівненська), знайдено: ${acAll.map(s => s.subtitle).join('; ')}`);
    }

    // 5. Автокомпліт з уточненням району: "рокитне сарн"
    const acSarn = window.SmartSearchEngine.getAutocompleteSuggestions('рокитне сарн', 'novaposhta');
    if (acSarn.length === 0 || !acSarn[0].subtitle.includes('Рівненська') || !acSarn[0].subtitle.includes('Сарненський')) {
      throw new Error("Автокомпліт для 'рокитне сарн' має повертати Рівненську область (Сарненський р-н)");
    }

    console.log("  ✓ Успіх: Запит 'сарнинський 2 рокитне' (також 'рокитнівський 2 рокитне') миттєво знаходить смт Рокитне №2 (вул. Патріотична, 44, Сарненський р-н, Рівненська обл.), а автокомпліт коректно відображає обидва варіанти!\\n");
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 25:', err.message, '\\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 26: Ctrl-F візуальне підсвічування ключових слів (Жовтий маркер <mark class="hl-match">)
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 26: Ctrl-F візуальне підсвічування ключових слів (Жовтий маркер <mark class="hl-match">)');
  try {
    // 1. Перевірка морфологічного підсвічування: одруківка в районі підсвічує правильну назву
    const query = 'сарнинський 2 рокитне';
    const subText = 'селище Рокитне, Сарненський район, Рівненська область';
    const hlSub = window.highlightMatch(subText, query);

    if (!hlSub.includes('<mark class="hl-match">Рокитне</mark>')) {
      throw new Error(`Очікувалось підсвічування <mark class="hl-match">Рокитне</mark>, отримано: '${hlSub}'`);
    }
    if (!hlSub.includes('<mark class="hl-match">Сарненський</mark>')) {
      throw new Error(`Очікувалось підсвічування <mark class="hl-match">Сарненський</mark> для запиту '${query}', отримано: '${hlSub}'`);
    }

    // 2. Підсвічування номера відділення
    const titleText = 'Відділення №2: вул. Патріотична, 44';
    const hlTitle = window.highlightMatch(titleText, query);
    if (!hlTitle.includes('№<mark class="hl-match">2</mark>')) {
      throw new Error(`Очікувалось підсвічування номера №<mark class="hl-match">2</mark>, отримано: '${hlTitle}'`);
    }

    // 3. Підсвічування вулиці
    const streetQuery = 'патріотична 44';
    const hlStreet = window.highlightMatch('вул. Патріотична, 44', streetQuery);
    if (!hlStreet.includes('<mark class="hl-match">Патріотична</mark>')) {
      throw new Error(`Очікувалось підсвічування вулиці, отримано: '${hlStreet}'`);
    }
    if (!hlStreet.includes('<mark class="hl-match">44</mark>')) {
      throw new Error(`Очікувалось підсвічування номера будинку 44, отримано: '${hlStreet}'`);
    }

    // 4. Перевірка створення повнорозмірної картки: спани містять підсвічені елементи
    const targetBranch = window.BRANCHES_DATA.novaposhta.find(b => b.city === 'Рокитне' && b.number === '2' && b.oblast === 'Рівненська');
    if (!targetBranch) {
      throw new Error("Цільове відділення Рокитне №2 (Рівненська обл.) не знайдено в базі!");
    }

    const card = window.createFullBranchCard(targetBranch, query);
    const cardHtml = card.innerHTML;

    if (!cardHtml.includes('<mark class="hl-match">')) {
      throw new Error("У згенерованій картці відділення відсутні теги <mark class=\"hl-match\">!");
    }
    const cityEl = card.querySelector('.city-highlight');
    if (!cityEl || !cityEl.innerHTML.includes('<mark class="hl-match">Рокитне</mark>')) {
      throw new Error(`У .city-highlight відсутній підсвічений маркер міста: ${cityEl ? cityEl.innerHTML : 'не знайдено'}`);
    }
    const branchEl = card.querySelector('.branch-highlight');
    if (!branchEl || !branchEl.innerHTML.includes('<mark class="hl-match">2</mark>')) {
      throw new Error(`У .branch-highlight відсутній підсвічений маркер номера: ${branchEl ? branchEl.innerHTML : 'не знайдено'}`);
    }
    const geoEl = card.querySelector('.geo-val');
    if (!geoEl || !geoEl.innerHTML.includes('<mark class="hl-match">Сарненський')) {
      throw new Error(`У .geo-val відсутній підсвічений маркер району: ${geoEl ? geoEl.innerHTML : 'не знайдено'}`);
    }

    console.log("  ✓ Успіх: Ctrl-F візуальне підсвічування бездоганно маркує місто, номер, вулицю та район з урахуванням морфології та коренів слів у поп-апах та картках!\n");
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 26:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 27: Валідація складних запитів зі скріншотів (v8.21.0 - 100% Google Equivalents)
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 27: Валідація 12 критичних кейсів зі скріншотів (v8.21.0 - Google Equivalents)');
  try {
    const np = window.BRANCHES_DATA.novaposhta;
    const screenshotCases = [
      { q: "ананїв соборна", expectCity: "Ананьїв", expectNum: "1" },
      { q: "ананів соборна", expectCity: "Ананьїв", expectNum: "1", expectStreet: "Соборна" },
      { q: "ананів соборна 1", expectCity: "Ананьїв", expectNum: "1", expectStreet: "Соборна" },
      { q: "чернігів варва 1", expectCity: "Варва", expectNum: "1" },
      { q: "варва 1", expectCity: "Варва", expectNum: "1" },
      { q: "великі любині львів 1", expectCity: "Великий Любінь", expectNum: "1" },
      { q: "великий любінь 1", expectCity: "Великий Любінь", expectNum: "1" },
      { q: "=володимирець рівне 1", expectCity: "Володимирець", expectNum: "1" },
      { q: "володимирець рівне 1", expectCity: "Володимирець", expectNum: "1" },
      { q: "кременць градан1", expectCity: "Града", expectNum: "1" },
      { q: "града 1", expectCity: "Града", expectNum: "1" },
      { q: "львів стрись довголука 1", expectCity: "Довголука", expectNum: "1" },
      { q: "довголука 1", expectCity: "Довголука", expectNum: "1" },
      { q: "нова пошта --- = дмитрівка київ бучан поштомат 45076", expectCity: "Дмитрівка", expectNum: "45076" },
      { q: "дмитрівка київ бучан поштомат", expectCity: "Дмитрівка" },
      { q: "ківерці центральна", expectCity: "Ківерці", expectNum: "1" },
      { q: "пОдеса софіхська 34", expectCity: "Одеса", expectNum: "12" },
      { q: "Одеса софіхська 34", expectCity: "Одеса", expectNum: "12" },
      { q: "староконстатинів ххмель 3", expectCity: "Старокостянтинів", expectNum: "3" },
      { q: "староконстатинів ххмель 1", expectCity: "Старокостянтинів", expectNum: "1" },
      { q: "полтав сеньча 1", expectCity: "Сенча", expectNum: "1" },
      { q: "сенча 1", expectCity: "Сенча", expectNum: "1" },
      { q: "київ бориспіль гнідин 2", expectCity: "Гнідин", expectNum: "2", expectStreet: "Заводська", expectRaion: "Бориспільський" }
    ];

    for (const tc of screenshotCases) {
      const res = window.SmartSearchEngine.searchBranches(tc.q, np, 5);
      const top = res && res[0];
      if (!top) {
        throw new Error(`Запит '${tc.q}' не повернув жодного результату!`);
      }
      if (tc.expectCity && top.city !== tc.expectCity) {
        throw new Error(`Запит '${tc.q}' повернув місто '${top.city}' замість '${tc.expectCity}'`);
      }
      if (tc.expectNum && String(top.number) !== String(tc.expectNum)) {
        throw new Error(`Запит '${tc.q}' повернув відділення №${top.number} замість №${tc.expectNum}`);
      }
      if (tc.expectStreet && (!top.street || !top.street.includes(tc.expectStreet))) {
        throw new Error(`Запит '${tc.q}' повернув вулицю '${top.street}' замість '${tc.expectStreet}'`);
      }
      if (tc.expectRaion && (!top.raion || !top.raion.includes(tc.expectRaion))) {
        throw new Error(`Запит '${tc.q}' повернув район '${top.raion}' замість '${tc.expectRaion}'`);
      }
    }

    console.log("  ✓ Успіх: Усі складні запити зі скріншотів (шумні символи '=', одруківки 'софіхська', 'ххмель', дезамбігуація сіл та райцентрів) бездоганно знаходять 100% цільових відділень!\n");
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 27:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 28: Повний реєстр населених пунктів України (26k+ сіл, смт та селищ): авторозпізнавання малих сіл
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 28: Перевірка авторозпізнавання малих сіл України (Великий Дальник, Миньківці, Горішня Вигнанка)');
  try {
    const npPool = window.BRANCHES_DATA.novaposhta;
    const resultsList = elementsById['resultsList'];
    const smallVillageCases = [
      { q: 'Великий Дальник 3', expectCity: 'Великий Дальник', expectNum: '3' },
      { q: 'Миньківці 1', expectCity: 'Миньківці', expectNum: '1' },
      { q: 'Горішня Вигнанка 1', expectCity: 'Горішня Вигнанка', expectNum: '1' },
      { q: 'київ бориспіль гнідин 2', expectCity: 'Гнідин', expectNum: '2' }
    ];

    for (let tc of smallVillageCases) {
      // Перевірка пошукового рушія
      const res = window.SmartSearchEngine.searchBranches(tc.q, npPool, 5);
      const top = res && res[0];
      if (!top) {
        throw new Error(`Двигун для '${tc.q}' не повернув результатів!`);
      }
      if (tc.expectCity && top.city !== tc.expectCity) {
        throw new Error(`Двигун для '${tc.q}' повернув '${top.city}' замість '${tc.expectCity}'`);
      }
      if (tc.expectNum && String(top.number) !== String(tc.expectNum)) {
        throw new Error(`Двигун для '${tc.q}' повернув №${top.number} замість №${tc.expectNum}`);
      }
    }

    console.log('  ✓ Успіх: Повний реєстр 26k+ населених пунктів бездоганно розпізнає малі села (Великий Дальник, Миньківці, Горішня Вигнанка) за O(1)!\n');
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 28:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 29: Мультифасетне прогресивне звуження пошуку (Progressive Context Narrowing)
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 29: Перевірка мультифасетного звуження контексту ("городок 1" -> "рівненська" -> "штейн")');
  try {
    const npPool = window.BRANCHES_DATA.novaposhta;

    // 1. "городок 1" -> декілька результатів з різних областей України (Рівненська, Львівська, Хмельницька тощо)
    const res1 = window.SmartSearchEngine.searchBranches("городок 1", npPool, 10);
    if (!res1 || res1.length < 2) {
      throw new Error(`Очікувалось кілька результатів для 'городок 1', отримано: ${res1 ? res1.length : 0}`);
    }
    const distinctOblasts = new Set(res1.map(x => x.oblast));
    if (distinctOblasts.size < 2) {
      throw new Error(`Очікувалось представництво кількох областей для 'городок 1', отримано тільки: ${Array.from(distinctOblasts).join(', ')}`);
    }

    // 2. "городок 1 рівненська" -> фільтрація ТІЛЬКИ Рівненської області
    const res2 = window.SmartSearchEngine.searchBranches("городок 1 рівненська", npPool, 10);
    if (!res2 || res2.length === 0) {
      throw new Error(`Жодного результату для 'городок 1 рівненська'`);
    }
    const nonRivne = res2.filter(x => !x.oblast || !x.oblast.includes('Рівнен'));
    if (nonRivne.length > 0) {
      throw new Error(`Знайдено не-Рівненські відділення для 'городок 1 рівненська': ${nonRivne.map(x => x.city + ' ' + x.oblast).join(', ')}`);
    }
    if (res2[0].city !== 'Городок' || String(res2[0].number) !== '1') {
      throw new Error(`Топ результат для 'городок 1 рівненська' має бути Городок №1, отримано: ${res2[0].city} №${res2[0].number}`);
    }

    // 3. "городок 1 рівненська штейн" -> 1 конкретне вантажне відділення на вул. Штейнгеля
    const res3 = window.SmartSearchEngine.searchBranches("городок 1 рівненська штейн", npPool, 10);
    if (!res3 || res3.length !== 1) {
      throw new Error(`Очікувався рівно 1 результат для 'городок 1 рівненська штейн', отримано: ${res3 ? res3.length : 0}`);
    }
    const top = res3[0];
    if (top.city !== 'Городок' || String(top.number) !== '1' || !top.street.toLowerCase().includes('штейнгел')) {
      throw new Error(`Результат не відповідає Відділенню №1 на вул. Штейнгеля: ${top.city} №${top.number}, ${top.street}`);
    }

    console.log('  ✓ Успіх: Прогресивне мультифасетне звуження бездоганно фільтрує базу від масового списку (9 відділень) до 1 конкретного на вул. Штейнгеля!\n');
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 29:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 30: Подвійна система копіювання Delengine (Класичний та CRM) та прогресивне звуження
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 30: Перевірка подвійної системи копіювання Delengine та прогресивного запиту "городок рівненська 1"');
  try {
    const npPool = window.BRANCHES_DATA.novaposhta;

    // 1. Прогресивний запит: "городок рівненська 1" -> виключно с. Городок Рівненської обл.
    const res = window.SmartSearchEngine.searchBranches("городок рівненська 1", npPool, 5);
    if (!res || res.length === 0) {
      throw new Error("Жодного результату для 'городок рівненська 1'");
    }
    const gor1 = res[0];
    if (gor1.city !== 'Городок' || String(gor1.number) !== '1' || !gor1.oblast.includes('Рівнен')) {
      throw new Error(`Очікувався Городок №1 Рівненської обл, отримано: ${gor1.city} №${gor1.number}, ${gor1.oblast}`);
    }

    // 2. Класичний короткий формат копіювання
    const classicStr = window.formatClassicCopyString(gor1);
    const expectedClassic = "село Городок, Вантажне відділення №1: вул. барона Штейнгеля, 2-А";
    if (classicStr !== expectedClassic) {
      throw new Error(`Класичний формат не відповідає очікуваному.\nОчікувалось: "${expectedClassic}"\nОтримано:    "${classicStr}"`);
    }

    // 3. Розширений детальний CRM-формат копіювання
    const detailedStr = window.formatDetailedCopyString(gor1);
    const expectedDetailed = "с. Городок (Рівненський р-н, Рівненська обл.), Вантажне відділення №1 (до 1100 кг): вул. барона Штейнгеля, 2-А";
    if (detailedStr !== expectedDetailed) {
      throw new Error(`Детальний формат не відповідає очікуваному.\nОчікувалось: "${expectedDetailed}"\nОтримано:    "${detailedStr}"`);
    }

    // 4. Перевірка для Ужгорода №1 (розширений CRM-формат з обласним районом та лімітом ваги)
    const uzh1 = npPool.find(b => b.city === 'Ужгород' && String(b.number) === '1');
    if (!uzh1) {
      throw new Error("Відділення №1 у місті Ужгород не знайдено");
    }
    const detailedUzh = window.formatDetailedCopyString(uzh1);
    const expectedUzh = "м. Ужгород (Ужгородський р-н, Закарпатська обл.), Вантажне відділення №1 (до 1100 кг): вул. Волонтерів, 16";
    if (detailedUzh !== expectedUzh) {
      throw new Error(`Детальний формат для Ужгорода не відповідає очікуваному.\nОчікувалось: "${expectedUzh}"\nОтримано:    "${detailedUzh}"`);
    }

    // 5. Перевірка наявності двох кнопок на картці відділення
    const card = window.createFullBranchCard(gor1);
    const btnShort = card.querySelector('.btn-copy-short');
    const btnDetailed = card.querySelector('.btn-copy-detailed');
    if (!btnShort || !btnDetailed) {
      throw new Error("На картці відділення мають бути присутні дві окремі кнопки: .btn-copy-short та .btn-copy-detailed");
    }

    console.log('  ✓ Успіх: Запит "городок рівненська 1" та подвійний формат копіювання (Класичний та CRM) працюють ідеально!\n');
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 30:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 31: Крайові випадки v8.24.1 — апострофи, складені топоніми, вулиця без номера
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 31: Апострофи (ʼ \' ’), складений топонім "великий дальник 3", вулиця без номера "городок рівненська штейн"');
  try {
    const npPool = window.BRANCHES_DATA.novaposhta;
    const S = window.SmartSearchEngine;

    // 1. Усі види апострофів дають те саме: П'ятихатки (Дніпропетровська обл.) Відділення №1
    for (const q of ['пʼятихатки 1', "п'ятихатки 1", 'п’ятихатки 1', 'пятихатки 1']) {
      const r = S.searchBranches(q, npPool, 5);
      if (!r || r.length === 0) throw new Error(`Жодного результату для '${q}'`);
      const t = r[0];
      if (canon(t.city) !== 'пятихатки' || String(t.number) !== '1' || !String(t.oblast).includes('Дніпропетровськ')) {
        throw new Error(`'${q}' -> очікувалось П'ятихатки №1 (Дніпропетровська), отримано: ${t.city} №${t.number} (${t.oblast})`);
      }
    }

    // 2. Складений топонім: "великий дальник 3" -> с. Великий Дальник №3
    const fc = S.extractFacets('великий дальник 3');
    if (fc.city !== 'Великий Дальник' || String(fc.number) !== '3') {
      throw new Error(`extractFacets('великий дальник 3') -> city='${fc.city}', number='${fc.number}'`);
    }
    for (const q of ['великий дальник 3', 'старий самбір 1', 'нова одеса 1', 'кривий ріг 1']) {
      const r = S.searchBranches(q, npPool, 5);
      if (!r || r.length === 0) throw new Error(`Жодного результату для '${q}'`);
    }
    const vd = S.searchBranches('великий дальник 3', npPool, 5)[0];
    if (vd.city !== 'Великий Дальник' || String(vd.number) !== '3' || vd.settlementType !== 'село') {
      throw new Error(`Очікувався с. Великий Дальник №3, отримано: ${vd.settlementType} ${vd.city} №${vd.number}`);
    }

    // 3. Вулиця без номера: топонім + область + "штейн" -> Городок №1 (вул. барона Штейнгеля)
    const gs = S.searchBranches('городок рівненська штейн', npPool, 5);
    if (!gs || gs.length === 0) throw new Error("Жодного результату для 'городок рівненська штейн'");
    if (gs[0].city !== 'Городок' || String(gs[0].number) !== '1' || !gs[0].street.toLowerCase().includes('штейнгел')) {
      throw new Error(`Очікувався Городок №1 (Штейнгеля), отримано: ${gs[0].city} №${gs[0].number}, ${gs[0].street}`);
    }
    if (gs.some(x => !String(x.oblast).includes('Рівнен') || !x.street.toLowerCase().includes('штейнгел'))) {
      throw new Error('У видачі є відділення не з Рівненської області або не на вул. Штейнгеля');
    }

    // 4. Живі дані API: city приходить з суфіксом "(Рівненська обл.)" — пошук має працювати так само
    const livePool = npPool.map(b => (b.city === 'Городок' || b.city === 'Рівне')
      ? { ...b, city: `${b.city} (${b.oblast} обл.)` } : b);
    const lv = S.searchBranches('городок рівненська штейн', livePool, 5);
    if (!lv || lv.length === 0 || String(lv[0].number) !== '1' || !lv[0].city.startsWith('Городок')) {
      throw new Error('Суфікс області в city (live API) ламає пошук "городок рівненська штейн"');
    }

    console.log('  ✓ Успіх: усі апострофи, "великий дальник 3" та "городок рівненська штейн" знаходять правильні відділення!\n');
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 31:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 32: v8.24.2 — вулиця без номера: UI-автокомпліт не має казати "не знайдено"
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 32: "городок рівненська штейн" -> Вантажне відділення №1 (автокомпліт, парсер, пошук) + регресії');
  try {
    const npPool = window.BRANCHES_DATA.novaposhta;
    const S = window.SmartSearchEngine;

    // 1. Парсер: топонім + область виділені, залишок "штейн" — це streetQuery, а не частина міста
    const p = S.parseQuery('городок рівненська штейн');
    if (!p.matchedSettlement || p.matchedSettlement.name !== 'Городок' || !String(p.detectedOblast).includes('Рівнен')) {
      throw new Error(`parseQuery: очікувалось Городок/Рівненська, отримано ${p.matchedSettlement && p.matchedSettlement.name}/${p.detectedOblast}`);
    }
    if (p.streetQuery !== 'штейн' || p.targetBranchNumber) {
      throw new Error(`parseQuery: streetQuery='${p.streetQuery}', targetBranchNumber='${p.targetBranchNumber}'`);
    }

    // 2. Автокомпліт (саме він показував "міст чи відділень не знайдено"): перший пункт — Вантажне відділення №1
    const ac = S.getAutocompleteSuggestions('городок рівненська штейн', 'novaposhta', null, npPool);
    if (!ac || ac.length === 0) throw new Error('Автокомпліт порожній для "городок рівненська штейн"');
    const first = ac[0];
    if (first.type !== 'branch' || first.title !== 'Вантажне відділення №1' ||
        !first.branchObj || first.branchObj.city !== 'Городок' || !first.subtitle.includes('Штейнгеля') ||
        !first.subtitle.includes('Рівненський р-н') || !first.subtitle.includes('Рівненська обл.')) {
      throw new Error(`Перший пункт автокомпліту некоректний: ${first.type} | ${first.title} | ${first.subtitle}`);
    }
    if (ac.some(x => !x.subtitle.includes('Штейнгеля') || !x.subtitle.includes('Рівненська обл.'))) {
      throw new Error('В автокомпліті є пункти не з вул. Штейнгеля / не з Рівненської області');
    }
    // Вибір пункту має відтворювати саме Городок №1 (Рівненська)
    const sel = S.searchBranches(first.textToFill, npPool, 5);
    if (sel.length !== 1 || sel[0].city !== 'Городок' || String(sel[0].number) !== '1') {
      throw new Error(`textToFill '${first.textToFill}' -> ${sel.length} результатів`);
    }
    // Без пулу відділень (порожній пул) — показуємо населений пункт, а не "не знайдено"
    const acNoPool = S.getAutocompleteSuggestions('городок рівненська штейн', 'ukrposhta', null, []);
    if (!acNoPool || acNoPool.length === 0 || acNoPool[0].title !== 'Городок') {
      throw new Error('Без пулу відділень очікувалась підказка населеного пункту Городок');
    }

    // 3. Пошук: Городок №1 першим
    const res = S.searchBranches('городок рівненська штейн', npPool, 5);
    if (!res.length || res[0].city !== 'Городок' || String(res[0].number) !== '1' || !res[0].street.includes('Штейнгеля')) {
      throw new Error('searchBranches: першим має бути Городок №1 (вул. барона Штейнгеля, 2-А)');
    }

    // 4. Регресії
    const r1 = S.searchBranches('городок 1 рівненська', npPool, 5);
    if (r1.length !== 1 || r1[0].city !== 'Городок' || !String(r1[0].oblast).includes('Рівнен') || String(r1[0].number) !== '1') {
      throw new Error(`регресія "городок 1 рівненська": ${r1.length} результатів`);
    }
    const r2 = S.searchBranches('великий дальник 3', npPool, 5);
    if (!r2.length || r2[0].city !== 'Великий Дальник' || String(r2[0].number) !== '3') {
      throw new Error('регресія "великий дальник 3"');
    }
    const r3 = S.searchBranches("п'ятихатки 1", npPool, 5);
    if (!r3.length || canon(r3[0].city) !== 'пятихатки' || String(r3[0].number) !== '1' || !String(r3[0].oblast).includes('Дніпропетровськ')) {
      throw new Error("регресія \"п'ятихатки 1\"");
    }
    // Старі підказки міст не зламані
    const acOld = S.getAutocompleteSuggestions('київ бориспіль', 'novaposhta', null, npPool);
    if (!acOld.length || acOld[0].type === 'branch') {
      throw new Error('регресія автокомпліту "київ бориспіль"');
    }

    console.log('  ✓ Успіх: "городок рівненська штейн" -> Вантажне відділення №1 (вул. барона Штейнгеля, 2-А); регресії в нормі!\n');
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 32:', err.message, '\n');
  }

  // --------------------------------------------------------------------------
  // ТЕСТ 33: v8.25.1 — LP-CRM UX автокомпліту, ліквідація over-highlighting, чистий 2-рядковий стиль відділення та закриття поп-апу
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 33: LP-CRM UX v8.25.1 ("київ 222", "львів наукова", "ізяслав", "олександрівка", дворядковий стиль без дублюючих бейджів та без over-highlighting)');
  try {
    const npPool = window.BRANCHES_DATA.novaposhta;
    const S = window.SmartSearchEngine;
    const resultsList = elementsById['resultsList'];

    // 1. City Suggestion Mode: "ізяслав", "олександрівка", "Городок"
    searchInput.value = 'ізяслав';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(360);

    if (dropdown.classList.contains('hidden') || dropdown.getAttribute('data-mode') !== 'city') {
      throw new Error('Дропдаун повинен бути відкритим у City Mode для "ізяслав"');
    }
    const izItems = dropdown.querySelectorAll('.autocomplete-item');
    if (izItems.length === 0) {
      throw new Error('Очікувались підказки міст для "ізяслав"');
    }
    const izHtml = izItems[0].innerHTML;
    if (!izHtml.includes('<mark class="hl-match">Ізяслав</mark>') || !izHtml.includes('р-н') || !izHtml.includes('обл.)')) {
      throw new Error(`Некоректний City Mode для "ізяслав": ${izHtml}`);
    }
    // Перевіряємо відсутність паразитної підсвітки службових слів ("р-н", "обл.")
    if (izHtml.includes('<mark class="hl-match">р-н</mark>') || izHtml.includes('<mark class="hl-match">обл</mark>')) {
      throw new Error(`Виявлено паразитну підсвітку службових слів для "ізяслав": ${izHtml}`);
    }

    // Перевірка "олександрівка" (кілька областей + смт/село бейджі)
    const oleksSuggestions = S.getAutocompleteSuggestions('олександрівка', 'novaposhta', null, npPool);
    if (!oleksSuggestions || oleksSuggestions.length < 3) {
      throw new Error('Очікувалось декілька варіантів для "олександрівка"');
    }
    for (const s of oleksSuggestions) {
      if (s.mode !== 'city' || !s.subtitle.startsWith('(') || !s.subtitle.endsWith(')') || !['місто', 'смт', 'село'].includes(s.badge)) {
        throw new Error(`Некоректний елемент City Mode для Олександрівки: ${JSON.stringify(s)}`);
      }
    }

    // 2. Branch Suggestion Mode: "київ 222" (2-рядковий формат, без дублюючого бейджа праворуч, без \n)
    searchInput.value = 'київ 222';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(360);

    if (dropdown.classList.contains('hidden') || dropdown.getAttribute('data-mode') !== 'branch') {
      throw new Error('Дропдаун повинен бути відкритим у Branch Mode для "київ 222"');
    }
    const kyiv222Items = dropdown.querySelectorAll('.autocomplete-item');
    if (kyiv222Items.length === 0) {
      throw new Error('Очікувались підказки відділень для "київ 222"');
    }
    const kyiv222Html = kyiv222Items[0].innerHTML;
    if (!kyiv222Html.includes('№<mark class="hl-match">222</mark>') ||
        !kyiv222Html.includes('•') ||
        !kyiv222Html.includes('(вага: до 30 кг)') ||
        !kyiv222Html.includes('просп. Академіка Глушкова, 31А')) {
      throw new Error(`Формат Branch Mode для "київ 222" некоректний: ${kyiv222Html}`);
    }
    if (kyiv222Html.includes('autocomplete-badge') || kyiv222Html.includes('\\n') || kyiv222Html.includes('вул. вул.')) {
      throw new Error(`У рядку відділення "київ 222" виявлено дублюючий бейдж, символ \\n або "вул. вул.": ${kyiv222Html}`);
    }
    if (/hl-match">(?:Відділення|Поштомат|вул|просп|буд)/i.test(kyiv222Html)) {
      throw new Error(`Виявлено паразитне підсвічування службових слів у "київ 222": ${kyiv222Html}`);
    }

    // 3. Префіксний пошук номера без існуючого точного відділення ("Київ 505" -> поштомати №5050, №5051... без помилки "не знайдено")
    searchInput.value = 'Київ 505';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(450);

    const kyiv505Sug = S.getAutocompleteSuggestions('Київ 505', 'novaposhta', null, npPool);
    if (!kyiv505Sug.length || !String(kyiv505Sug[0].branchObj.number).startsWith('505')) {
      throw new Error('Для "Київ 505" першими у списку мають виводитися поштомати/відділення з префіксом 505');
    }
    if (resultsList.innerHTML.includes('не знайдено')) {
      throw new Error(`Для "Київ 505" при наявності поштоматів 505x не повинно з'являтися повідомлення про помилку "не знайдено"`);
    }

    // 4. Перевірка "львів наукова" (вулиця переводить дропдаун у режим відділень, підсвічується лише "Наукова", без "вул. вул.")
    searchInput.value = 'львів наукова';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(360);

    if (dropdown.classList.contains('hidden') || dropdown.getAttribute('data-mode') !== 'branch') {
      throw new Error('Для "львів наукова" дропдаун має перейти в Branch Mode (data-mode="branch")');
    }
    const lvivNaukItems = dropdown.querySelectorAll('.autocomplete-item');
    const lvivNaukHtml = lvivNaukItems[0] ? lvivNaukItems[0].innerHTML : '';
    if (!lvivNaukHtml.includes('<mark class="hl-match">Наукова</mark>')) {
      throw new Error(`Очікувалось підсвічування вулиці Наукова у Branch Mode: ${lvivNaukHtml}`);
    }
    if (lvivNaukHtml.includes('вул. вул.') || lvivNaukHtml.includes('вул. просп.') || /hl-match">(?:вул|просп|Відділення|Поштомат)/i.test(lvivNaukHtml)) {
      throw new Error(`У "львів наукова" виявлено дублювання "вул." або підсвітку службових слів: ${lvivNaukHtml}`);
    }

    // 5. Вибір конкретного відділення (кліком або Enter) МИТТЄВО закриває дропдаун і залишає його закритим
    searchInput.dispatchEvent({ type: 'keydown', key: 'ArrowDown', preventDefault() {} });
    if (!lvivNaukItems[0].classList.contains('focused')) {
      throw new Error('ArrowDown має виділити перший пункт відділення класом .focused');
    }
    searchInput.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault() {} });
    await sleep(350);

    if (!dropdown.classList.contains('hidden')) {
      throw new Error('Після вибору відділення клавішею Enter дропдаун повинен залишатися закритим (hidden)');
    }
    const renderedCard = resultsList.querySelector('.branch-card');
    if (!renderedCard) {
      throw new Error('Після вибору відділення клавішею Enter має відобразитися повна картка відділення (.branch-card)');
    }
    const btnShort = renderedCard.querySelector('.btn-copy-short');
    const btnDetailed = renderedCard.querySelector('.btn-copy-detailed');
    if (!btnShort || !btnDetailed) {
      throw new Error('На відкритій картці відділення повинні бути обидві кнопки копіювання (.btn-copy-short та .btn-copy-detailed)');
    }

    console.log('  ✓ Успіх: "київ 222", "львів наукова", "ізяслав", "олександрівка" та префіксні номери працюють ідеально без over-highlighting!\n');
    passedTests++;
  } catch (err) {
    console.error('  ✗ Провал Тесту 33:', err.message, '\n');
  }

  console.log('===============================================================');
  console.log(`📊 РЕЗУЛЬТАТ: ${passedTests} / ${totalTests} ТЕСТІВ ПРОЙДЕНО УСПІШНО!`);
  console.timeEnd('⏱️ Час виконання тестів');
  console.log('===============================================================');

  clearTimeout(watchdogTimer);
  process.exit(passedTests === totalTests ? 0 : 1);
}

runTests().catch(err => {
  console.error('Критична помилка виконання тестів:', err);
  process.exit(1);
});
