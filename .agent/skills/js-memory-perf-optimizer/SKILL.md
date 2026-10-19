---
name: js-memory-perf-optimizer
description: Оптимізація пам'яті JS Heap, LRU-кешування та запобігання layout thrashing у клієнтському DOM.
---

# Skill: High-Performance Vanilla JS & DOM Profiler

## Rules:
1. Нульовий оверхед пам'яті: ніколи не зберігати дублюючі поля (наприклад, normalizedSearchText) для 55k записів. Усе рахувати на льоту або кешувати в LRU.
2. Batch DOM Updates: усі рендери карток виконувати виключно через DocumentFragment або швидку заміну вузлів; ліміт не більше 20 вузлів у видачі одночасно.
3. Алгоритмічна складність: уникати вкладених циклів O(N*M) по масиву branches. Використовувати хеш-мапи (Map / Set) для миттєвих O(1) перевірок.
