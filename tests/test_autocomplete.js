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
  }

  get className() {
    return Array.from(this._classList).join(' ');
  }

  set className(val) {
    this._classList = new Set((val || '').split(/\s+/).filter(Boolean));
  }

  get innerHTML() {
    return this._innerHTML;
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
    getElementById(id) { return getOrCreateElement(id); },
    querySelector(sel) {
      if (sel.startsWith('#')) return getOrCreateElement(sel.slice(1));
      return new MockElement('div');
    },
    querySelectorAll() { return []; },
    createElement(tag) { return new MockElement(tag); },
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
  let totalTests = 10;

  const { mockDocument, elementsById } = createMockEnvironment();

  // Setup Global Scope
  global.window = global;
  global.document = mockDocument;
  global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
  global.sessionStorage = { getItem: () => null, setItem: () => {} };
  global.localStorage = { getItem: () => null, setItem: () => {} };
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
    console.error('\n⏱️ ТАЙМАУТ: Тести перевищили допустимий ліміт виконання (10с).');
    process.exit(1);
  }, 10000);
  if (watchdogTimer.unref) watchdogTimer.unref();

  console.time('⏱️ Час виконання тестів');

  // Load Engines and App Code
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
  // ТЕСТ 1: Поступовий набір "ки" -> "київ" -> "київ 11" (без спонтанного закриття, структурований формат)
  // --------------------------------------------------------------------------
  console.log('▶ ТЕСТ 1: Поступовий набір тексту "ки" -> "київ" -> "київ 11"');
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

    // 3. Чекаємо 500мс (фоновий пошук списку знизу)
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

    // 5. Вводимо "київ 11" (пошук конкретного відділення)
    searchInput.value = 'київ 11';
    searchInput.dispatchEvent({ type: 'input' });
    await sleep(350);
    if (dropdown.classList.contains('hidden')) {
      throw new Error('Поп-ап повинен залишатися відкритим при "київ 11"');
    }

    const items11 = dropdown.querySelectorAll('.autocomplete-item');
    if (items11.length === 0) {
      throw new Error('Очікувалося відділення №11 для Києва');
    }
    const item11 = items11[0];
    const subText = item11.querySelector('.autocomplete-sub').innerHTML;
    const plainSub = subText.replace(/<[^>]+>/g, '');

    // Перевірка формату адреси: Місто — Область — Відділення/вулиця
    if (!plainSub.includes('Київ') || !plainSub.includes('Київська обл.') || !plainSub.includes('№11')) {
      throw new Error(`Очікувався повний географічний ланцюжок у Subtitle, отримано: "${subText}"`);
    }

    console.log('  ✓ Успіх: Поп-ап стабільно відкритий під час усього набору "ки" -> "київ" -> "київ 11", адреса структурована без помилок.\n');
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
