'use strict';

const API_KEY = 'b72f9da98c993f4ebcdd656507ea0e7b';
const API_BASE = 'https://api.openweathermap.org/data/2.5/';
const form = document.querySelector('#weather-form');
const cityInput = document.querySelector('#city');
const button = form.querySelector('button');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
const currentContainer = document.querySelector('#current');
const forecastContainer = document.querySelector('#forecast');
const number = (value) => Math.round(value);

function apiUrl(endpoint, params) {
  return `${API_BASE}${endpoint}?${new URLSearchParams({ ...params, appid: API_KEY, units: 'metric', lang: 'pl' })}`;
}

function errorMessage(code) {
  if (Number(code) === 404)
    return 'Nie znaleziono miejscowości. Sprawdź nazwę i kod kraju.';
  if (Number(code) === 401)
    return 'Klucz API jest nieprawidłowy lub nie został jeszcze aktywowany.';
  if (Number(code) === 429)
    return 'Przekroczono limit zapytań. Spróbuj ponownie później.';
  return 'Nie udało się pobrać danych pogodowych. Spróbuj ponownie.';
}

// Codex: opakowanie asynchronicznego XMLHttpRequest w Promise umożliwia użycie await.
// Obsługa obejmuje błędy HTTP, błędy sieci i przekroczenie czasu oczekiwania.
function getCurrentWeather(city) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', apiUrl('weather', { q: city }), true);
    xhr.responseType = 'json';
    xhr.timeout = 15000;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        console.log('Current Weather — XMLHttpRequest:', xhr.response);
        resolve(xhr.response);
      } else reject(new Error(errorMessage(xhr.status)));
    };
    xhr.onerror = () =>
      reject(new Error('Błąd sieci. Sprawdź połączenie z internetem.'));
    xhr.ontimeout = () =>
      reject(new Error('Przekroczono czas oczekiwania na bieżącą pogodę.'));
    xhr.send();
  });
}

async function getForecast(coord) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(
      apiUrl('forecast', { lat: coord.lat, lon: coord.lon }),
      { signal: controller.signal },
    );
    if (!response.ok) throw new Error(errorMessage(response.status));
    const data = await response.json();
    console.log('5 Day Forecast — Fetch API:', data);
    return data;
  } catch (error) {
    if (error.name === 'AbortError')
      throw new Error('Przekroczono czas oczekiwania na prognozę.');
    if (error instanceof TypeError)
      throw new Error('Błąd sieci podczas pobierania prognozy.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Codex: tworzenie elementów przez textContent pozwala bezpiecznie wyświetlać dane API.
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function icon(weather) {
  const img = element('img');
  // Codex: wyrażenie regularne sprawdza identyfikator ikony przed zbudowaniem URL.
  const code = /^\d{2}[dn]$/.test(weather.icon) ? weather.icon : '03d';
  img.src = `https://openweathermap.org/img/wn/${code}@2x.png`;
  img.alt = weather.description;
  img.width = 80;
  img.height = 80;
  return img;
}
// Codex: API podaje czas Unix i przesunięcie strefy w sekundach.
// Po dodaniu przesunięcia formatujemy datę jako UTC, by nie dodać strefy przeglądarki.
function localDate(timestamp, timezone) {
  return new Date((timestamp + timezone) * 1000);
}
function dateLabel(timestamp, timezone, options) {
  return new Intl.DateTimeFormat('pl-PL', {
    ...options,
    timeZone: 'UTC',
  }).format(localDate(timestamp, timezone));
}
function renderCurrent(data) {
  document.querySelector('#current-heading').textContent =
    `${data.name}, ${data.sys.country}`;
  const grid = element('div', 'current-grid');
  const overview = element('div');
  const condition = element('div', 'condition');
  condition.append(
    element('span', 'temperature', `${number(data.main.temp)}°`),
    icon(data.weather[0]),
  );
  overview.append(
    condition,
    element('p', 'description', data.weather[0].description),
    element(
      'p',
      'observed',
      `Pomiar: ${dateLabel(data.dt, data.timezone, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · czas miejscowy`,
    ),
  );
  const metrics = element('div', 'metrics');
  for (const [label, value] of [
    ['Odczuwalna', `${number(data.main.feels_like)} °C`],
    ['Wiatr', `${data.wind.speed.toFixed(1)} m/s`],
    ['Wilgotność', `${data.main.humidity}%`],
    ['Ciśnienie', `${data.main.pressure} hPa`],
  ]) {
    const metric = element('div', 'metric');
    metric.append(element('span', '', label), element('strong', '', value));
    metrics.append(metric);
  }
  grid.append(overview, metrics);
  currentContainer.replaceChildren(grid);
}
function renderForecast(data) {
  const timezone = data.city.timezone;
  // Codex: Map grupuje pomiary co 3 godziny według daty lokalnej miasta.
  // Okres może obejmować sześć dat, gdy pierwszy i ostatni dzień są niepełne.
  const groups = new Map();
  for (const item of data.list) {
    const date = localDate(item.dt, timezone).toISOString().slice(0, 10);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(item);
  }
  const days = element('div', 'days');
  for (const items of groups.values()) {
    // Codex: reduce wybiera pomiar najbliższy lokalnemu południu jako ikonę dnia.
    const representative = items.reduce((best, item) =>
      Math.abs(localDate(item.dt, timezone).getUTCHours() - 12) <
      Math.abs(localDate(best.dt, timezone).getUTCHours() - 12)
        ? item
        : best,
    );
    // Codex: agregacja temperatur i największego prawdopodobieństwa opadów w danym dniu.
    const min = Math.min(...items.map((item) => item.main.temp_min));
    const max = Math.max(...items.map((item) => item.main.temp_max));
    const rain = Math.round(
      Math.max(...items.map((item) => item.pop || 0)) * 100,
    );
    const card = element('article', 'day');
    card.append(
      element(
        'h3',
        '',
        dateLabel(representative.dt, timezone, { weekday: 'long' }),
      ),
      element(
        'span',
        'date',
        dateLabel(representative.dt, timezone, {
          day: 'numeric',
          month: 'long',
        }),
      ),
      icon(representative.weather[0]),
    );
    const range = element('div', 'range', `${number(max)}° `);
    range.append(element('small', '', `/ ${number(min)}°`));
    card.append(
      range,
      element('p', 'description', representative.weather[0].description),
      element('p', '', `Szansa opadów: ${rain}%`),
    );
    const details = element('details');
    const hours = element('ul', 'hours');
    for (const item of items)
      hours.append(
        element(
          'li',
          '',
          `${dateLabel(item.dt, timezone, { hour: '2-digit', minute: '2-digit' })} · ${number(item.main.temp)} °C · ${item.weather[0].description}`,
        ),
      );
    details.append(element('summary', '', 'Zobacz godziny'), hours);
    card.append(details);
    days.append(card);
  }
  forecastContainer.replaceChildren(days);
}

// Codex: kolejność await zapewnia wspólną lokalizację obu odpowiedzi.
// Po błędzie prognozy zachowujemy pobraną pogodę bieżącą; finally odblokowuje formularz.
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const city = cityInput.value.trim();
  if (!city) {
    status.textContent = 'Wpisz nazwę miejscowości.';
    status.className = 'error';
    cityInput.focus();
    return;
  }
  button.disabled = true;
  results.setAttribute('aria-busy', 'true');
  status.className = '';
  status.textContent = 'Pobieranie pogody…';
  currentContainer.replaceChildren(
    element('p', 'placeholder', 'Pobieranie bieżącej pogody…'),
  );
  forecastContainer.replaceChildren(
    element('p', 'placeholder', 'Pobieranie prognozy…'),
  );
  document.querySelector('#current-heading').textContent = 'Pogoda bieżąca';
  let currentLoaded = false;
  try {
    const current = await getCurrentWeather(city);
    renderCurrent(current);
    currentLoaded = true;
    const forecast = await getForecast(current.coord);
    renderForecast(forecast);
    status.textContent = `Pogoda dla ${current.name} została zaktualizowana. Temperatury w °C, godziny w czasie miejscowym.`;
  } catch (error) {
    status.className = 'error';
    status.textContent = error.message;
    if (!currentLoaded)
      currentContainer.replaceChildren(
        element('p', 'placeholder', 'Brak danych pogodowych.'),
      );
    forecastContainer.replaceChildren(
      element(
        'p',
        'placeholder',
        'Prognoza jest niedostępna. Spróbuj ponownie.',
      ),
    );
  } finally {
    button.disabled = false;
    results.setAttribute('aria-busy', 'false');
  }
});
