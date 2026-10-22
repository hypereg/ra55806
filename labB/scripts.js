'use strict';

class Todo {
  constructor() {
    this.tasks = [];
    this.term = '';
    this.storageKey = 'ai-lab-b-tasks';
    this.container = document.querySelector('#tasks');
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
      if (!Array.isArray(saved) || saved.some(task => !task || typeof task.id !== 'string' ||
        typeof task.text !== 'string' || typeof task.date !== 'string')) {
        throw new Error('Nieprawidłowy format');
      }
      this.tasks = saved;
    } catch {
      this.message('Nie udało się odczytać zapisanych zadań.');
    }
    document.querySelector('#search').addEventListener('input', event => {
      this.term = event.target.value;
      this.draw();
    });
    document.querySelector('#add-form').addEventListener('submit', event => {
      event.preventDefault();
      try {
        this.add(document.querySelector('#task-text').value, document.querySelector('#task-date').value);
        event.target.reset();
        document.querySelector('#task-text').focus();
      } catch (error) {
        this.message(error.message);
      }
    });
    this.draw();
  }

  message(text) {
    document.querySelector('#message').textContent = text;
  }

  validate(text, date, originalDate = '') {
    text = text.trim();
    if (text.length < 3 || text.length > 255) throw new Error('Zadanie musi mieć od 3 do 255 znaków.');
    if (date && (!Number.isFinite(new Date(date).getTime()) ||
      (date !== originalDate && new Date(date).getTime() <= Date.now()))) {
      throw new Error('Termin musi być pusty albo wskazywać przyszłą datę i godzinę.');
    }
    return { text, date };
  }

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.tasks));
      this.message('Zmiany zapisane.');
    } catch {
      this.message('Nie udało się zapisać zmian w pamięci przeglądarki.');
    }
    this.draw();
  }

  add(text, date = '') {
    const values = this.validate(text, date);
    this.tasks.push({ id: crypto.randomUUID(), ...values });
    this.save();
  }

  remove(id) {
    this.tasks = this.tasks.filter(task => task.id !== id);
    this.save();
  }

  edit(id, text, date = '') {
    const task = this.tasks.find(item => item.id === id);
    if (!task) return;
    Object.assign(task, this.validate(text, date, task.date));
    this.save();
  }

  get filteredTasks() {
    const term = this.term.trim().toLocaleLowerCase('pl');
    return term.length < 2 ? this.tasks : this.tasks.filter(task => task.text.toLocaleLowerCase('pl').includes(term));
  }

  highlightedText(text) {
    const fragment = document.createDocumentFragment();
    const term = this.term.trim().toLocaleLowerCase('pl');
    let start = 0;
    if (term.length >= 2) {
      const lowerText = text.toLocaleLowerCase('pl');
      let index;
      while ((index = lowerText.indexOf(term, start)) !== -1) {
        fragment.append(text.slice(start, index));
        const mark = document.createElement('mark');
        mark.textContent = text.slice(index, index + term.length);
        fragment.append(mark);
        start = index + term.length;
      }
    }
    fragment.append(text.slice(start));
    return fragment;
  }

  startEditing(row, task) {
    if (row.querySelector('input')) return;
    const text = document.createElement('input');
    text.value = task.text;
    text.maxLength = 255;
    text.setAttribute('aria-label', 'Edytuj treść zadania');
    const date = document.createElement('input');
    date.type = 'datetime-local';
    date.value = task.date;
    date.setAttribute('aria-label', 'Edytuj termin zadania');
    const error = document.createElement('span');
    error.className = 'error';
    error.setAttribute('role', 'alert');
    row.querySelector('.task-content').replaceChildren(text, date, error);
    const finish = () => {
      try {
        this.edit(task.id, text.value, date.value);
      } catch (exception) {
        error.textContent = exception.message;
      }
    };
    row.addEventListener('focusout', () => {
      setTimeout(() => {
        if (row.isConnected && !row.contains(document.activeElement)) finish();
      }, 0);
    });
    for (const input of [text, date]) {
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); finish(); }
        if (event.key === 'Escape') this.draw();
      });
    }
    text.focus();
  }

  draw() {
    this.container.replaceChildren();
    const tasks = this.filteredTasks;
    document.querySelector('#counter').textContent = `Widoczne zadania: ${tasks.length} / ${this.tasks.length}`;
    if (!tasks.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = this.tasks.length ? 'Brak pasujących zadań.' : 'Lista jest pusta. Dodaj pierwsze zadanie poniżej.';
      this.container.append(empty);
    }
    for (const task of tasks) {
      const row = document.createElement('article');
      row.className = 'task';
      const content = document.createElement('div');
      content.className = 'task-content';
      const edit = document.createElement('button');
      edit.className = 'task-edit';
      edit.title = 'Kliknij, aby edytować zadanie i termin';
      edit.append(this.highlightedText(task.text));
      const date = document.createElement('small');
      date.textContent = task.date ? new Date(task.date).toLocaleString('pl-PL') : 'Bez terminu';
      edit.append(date);
      edit.addEventListener('click', () => this.startEditing(row, task));
      content.append(edit);
      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.textContent = 'Usuń';
      remove.setAttribute('aria-label', `Usuń zadanie: ${task.text}`);
      remove.addEventListener('click', () => this.remove(task.id));
      row.append(content, remove);
      this.container.append(row);
    }
  }
}

document.todo = new Todo();
