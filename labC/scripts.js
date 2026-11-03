'use strict';

const $ = (id) => document.getElementById(id);
const map = L.map('map', {
  zoomAnimation: false,
  fadeAnimation: false,
}).setView([52.2297, 21.0122], 13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  crossOrigin: 'anonymous',
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
let marker,
  selected = null,
  completed = false,
  imageUrl;
const slots = [];
const message = (text) => {
  $('message').textContent = text;
};
for (let i = 0; i < 16; i++) {
  const slot = document.createElement('div');
  slot.className = 'slot';
  slot.dataset.index = i;
  slot.dataset.label = i + 1;
  slot.tabIndex = 0;
  slot.setAttribute('role', 'button');
  slot.setAttribute('aria-label', `Pole ${i + 1}`);
  $('board').append(slot);
  slots.push(slot);
}
$('locate').addEventListener('click', () => {
  if (!navigator.geolocation) {
    message('Ta przeglądarka nie obsługuje geolokalizacji.');
    return;
  }
  $('locate').disabled = true;
  $('coordinates').textContent = 'Ustalanie lokalizacji…';
  // Codex: lokalizacja jest pobierana asynchronicznie. Pierwsza funkcja
  // obsługuje wynik, druga błąd, a ostatni argument ustawia czas i dokładność.
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const point = [coords.latitude, coords.longitude];
      map.setView(point, 15);
      if (marker) map.removeLayer(marker);
      marker = L.circleMarker(point, {
        radius: 9,
        color: '#185b47',
        fillOpacity: 0.75,
      })
        .addTo(map)
        .bindPopup('Twoja lokalizacja')
        .openPopup();
      $('coordinates').textContent =
        `Szerokość: ${point[0].toFixed(6)}°, długość: ${point[1].toFixed(6)}° (dokładność ±${Math.round(coords.accuracy)} m).`;
      $('locate').disabled = false;
    },
    (error) => {
      $('coordinates').textContent =
        {
          1: 'Brak zgody na lokalizację.',
          2: 'Lokalizacja jest niedostępna.',
          3: 'Przekroczono czas ustalania lokalizacji.',
        }[error.code] || 'Nie udało się ustalić lokalizacji.';
      $('locate').disabled = false;
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
  );
});
// Codex: zgoda przeglądarki nie gwarantuje widocznego banera w macOS.
// Przycisk wysyła test, a błędy API są pokazywane na stronie i w konsoli.
function sendNotification(title, body) {
  if (!window.isSecureContext) {
    $('permission').textContent = 'Otwórz stronę przez HTTPS lub localhost.';
    return;
  }
  if (!('Notification' in window)) {
    $('permission').textContent = 'Ta przeglądarka nie obsługuje powiadomień. Otwórz stronę w osobnym oknie przeglądarki.';
    return;
  }
  if (Notification.permission !== 'granted') {
    $('permission').textContent = Notification.permission === 'denied'
      ? 'Powiadomienia zablokowane. Zezwól na nie w ustawieniach tej strony.'
      : 'Kliknij „Włącz powiadomienia” i udziel zgody.';
    return;
  }
  try {
    const notification = new Notification(title, { body });
    $('permission').textContent = 'Wysłano powiadomienie. Jeśli nie ma banera, sprawdź powiadomienia przeglądarki w macOS oraz tryb Nie przeszkadzać.';
    notification.onerror = (event) => {
      console.error('Błąd wyświetlania powiadomienia:', event);
      $('permission').textContent = 'Przeglądarka zgłosiła błąd powiadomienia. Sprawdź jej uprawnienia w macOS.';
    };
    notification.onshow = () => {
      console.debug('Przeglądarka zgłosiła wyświetlenie powiadomienia:', title);
    };
    return notification;
  } catch (error) {
    console.error('Nie udało się wysłać powiadomienia:', error);
    $('permission').textContent = 'Nie udało się wysłać powiadomienia. Szczegóły są w konsoli przeglądarki.';
  }
}
$('notifications').addEventListener('click', async () => {
  if (!window.isSecureContext || !('Notification' in window)) {
    sendNotification('', '');
    return;
  }
  try {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission === 'granted') {
      $('notifications').textContent = 'Testuj powiadomienia';
      sendNotification(
        completed ? 'Mapa ułożona!' : 'Test powiadomień',
        completed
          ? 'Gratulacje! Wszystkie 16 puzzli jest na swoim miejscu.'
          : 'Powiadomienia z aplikacji labC działają.',
      );
    } else {
      sendNotification('', '');
    }
  } catch (error) {
    console.error('Błąd uzyskiwania zgody na powiadomienia:', error);
    $('permission').textContent = 'Nie udało się uzyskać zgody na powiadomienia.';
  }
});
function loadTile(url) {
  // Codex: Promise pozwala poczekać na obraz przed narysowaniem go w canvas.
  // crossOrigin umożliwia eksport rastra, jeśli serwer kafelków zezwala na CORS.
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => {
      image.src = '';
      reject(new Error('Timeout'));
    }, 15000);
    image.onload = () => {
      clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Tile unavailable'));
    };
    image.src = url;
  });
}
$('capture').addEventListener('click', async () => {
  $('capture').disabled = true;
  message('Pobieranie kafelków i zapisywanie mapy w canvas…');
  // Codex: zapamiętujemy widok przed pobieraniem, aby przesunięcie mapy
  // w trakcie oczekiwania nie zmieniło współrzędnych eksportowanego obrazu.
  const bounds = map.getPixelBounds();
  const zoom = map.getZoom();
  const size = map.getSize();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 480;
  const ctx = canvas.getContext('2d');
  const tasks = [];
  // Codex: kafelki mają 256 × 256 pikseli. Z granic widoku wyliczamy
  // numery kafelków potrzebnych do odtworzenia aktualnego fragmentu mapy.
  for (
    let y = Math.floor(bounds.min.y / 256);
    y <= Math.floor((bounds.max.y - 1) / 256);
    y++
  ) {
    for (
      let x = Math.floor(bounds.min.x / 256);
      x <= Math.floor((bounds.max.x - 1) / 256);
      x++
    ) {
      const count = 2 ** zoom;
      if (y < 0 || y >= count) continue;
      // Codex: zawijamy numer kolumny po przekroczeniu krawędzi mapy świata.
      // Podwójne modulo obsługuje również ujemne wartości x.
      const wrappedX = ((x % count) + count) % count;
      tasks.push(
        loadTile(
          `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`,
        ).then((image) => {
          // Codex: odejmujemy początek widoku i skalujemy kafelek
          // do współrzędnych wynikowego obrazu o rozmiarze 480 × 480.
          ctx.drawImage(
            image,
            ((x * 256 - bounds.min.x) * 480) / size.x,
            ((y * 256 - bounds.min.y) * 480) / size.y,
            (256 * 480) / size.x,
            (256 * 480) / size.y,
          );
        }),
      );
    }
  }
  try {
    // Codex: czekamy na wszystkie kafelki. Dopiero po udanym eksporcie
    // zastępujemy poprzedni raster i tworzymy nową układankę.
    await Promise.all(tasks);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) throw new Error('Canvas export failed');
    $('raster').getContext('2d').drawImage(canvas, 0, 0);
    // Codex: zwalniamy poprzedni adres obrazu, aby nie zajmował pamięci.
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = URL.createObjectURL(blob);
    $('download').href = imageUrl;
    $('download').hidden = false;
    makePieces();
    $('shuffle').disabled = false;
    message('Mapa pobrana. Przenieś 16 puzzli ze stołu na planszę.');
  } catch {
    message(
      'Nie udało się pobrać mapy. Sprawdź połączenie i spróbuj ponownie. Poprzednia układanka została zachowana.',
    );
  } finally {
    $('capture').disabled = false;
  }
});
function makePieces() {
  selected = null;
  completed = false;
  $('tray').replaceChildren();
  slots.forEach((slot) => {
    slot.replaceChildren();
    slot.classList.remove('correct');
  });
  const pieces = Array.from({ length: 16 }, (_, i) => {
    const piece = document.createElement('button');
    piece.type = 'button';
    piece.className = 'piece';
    piece.id = `piece-${i}`;
    piece.dataset.index = i;
    piece.draggable = true;
    piece.setAttribute('aria-label', `Puzzel ${i + 1}`);
    piece.setAttribute('aria-pressed', 'false');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 120;
    // Codex: i % 4 wyznacza kolumnę, a Math.floor(i / 4) wiersz puzzla.
    // drawImage wycina odpowiedni fragment 120 × 120 z rastra 480 × 480.
    canvas
      .getContext('2d')
      .drawImage(
        $('raster'),
        (i % 4) * 120,
        Math.floor(i / 4) * 120,
        120,
        120,
        0,
        0,
        120,
        120,
      );
    piece.append(canvas);
    return piece;
  });
  // Codex: algorytm Fishera–Yatesa miesza puzzle, zamieniając każdy element
  // z losowo wybranym elementem z jeszcze niewymieszanej części tablicy.
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  $('tray').append(...pieces);
  verify();
}
function place(piece, target) {
  if (!piece || !(target === $('tray') || target.classList.contains('slot')))
    return;
  if (piece.parentElement === target) return;
  // Codex: gdy pole docelowe jest zajęte, jego puzzel wraca do miejsca,
  // z którego zabrano przenoszony element. W ten sposób zamieniamy puzzle.
  const origin = piece.parentElement;
  if (target.classList.contains('slot') && target.firstElementChild)
    origin.append(target.firstElementChild);
  target.append(piece);
  select(null);
  verify();
}
function select(piece) {
  document.querySelectorAll('.piece.selected').forEach((p) => {
    p.classList.remove('selected');
    p.setAttribute('aria-pressed', 'false');
  });
  selected = piece;
  if (piece) {
    piece.classList.add('selected');
    piece.setAttribute('aria-pressed', 'true');
  }
}
function verify() {
  // Codex: porównujemy indeks puzzla z indeksem pola. Operator ?. pozwala
  // sprawdzić także puste pole bez błędu odczytu właściwości.
  let correct = 0;
  slots.forEach((slot) => {
    const matches =
      slot.firstElementChild?.dataset.index === slot.dataset.index;
    slot.classList.toggle('correct', matches);
    if (matches) correct++;
  });
  $('progress').textContent = `${correct} / 16 na miejscu`;
  // Codex: flaga completed zapobiega ponownemu powiadomieniu
  // przy kolejnych sprawdzeniach tej samej ukończonej układanki.
  if (correct === 16 && !completed) {
    completed = true;
    console.debug('Wszystkie 16 puzzli jest na swoim miejscu.');
    message('Brawo! Wszystkie 16 puzzli jest na swoim miejscu.');
    sendNotification(
      'Mapa ułożona!',
      'Gratulacje! Wszystkie 16 puzzli jest na swoim miejscu.',
    );
  } else if (correct < 16 && completed) {
    completed = false;
    message('Układanka została zmieniona. Ułóż ponownie wszystkie elementy.');
  }
}
for (const target of [...slots, $('tray')]) {
  // Codex: preventDefault w dragover pozwala upuścić element na tym polu.
  // Bez tego przeglądarka domyślnie nie zaakceptuje operacji drop.
  target.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    target.classList.add('drag-over');
  });
  target.addEventListener('dragleave', () =>
    target.classList.remove('drag-over'),
  );
  target.addEventListener('drop', (event) => {
    event.preventDefault();
    target.classList.remove('drag-over');
    const piece = document.getElementById(
      event.dataTransfer.getData('text/plain'),
    );
    if (piece?.classList.contains('piece')) place(piece, target);
  });
  target.addEventListener('click', (event) => {
    const piece = event.target.closest('.piece');
    if (selected && target.classList.contains('slot')) place(selected, target);
    else if (piece) select(selected === piece ? null : piece);
    else if (selected) place(selected, target);
  });
  target.addEventListener('keydown', (event) => {
    if (event.target === target && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (selected) place(selected, target);
    }
  });
}
document.addEventListener('dragstart', (event) => {
  const piece = event.target.closest('.piece');
  if (!piece) return;
  // Codex: przenosimy identyfikator puzzla przez dataTransfer.
  // Obsługa drop odczytuje go i odnajduje właściwy element w dokumencie.
  event.dataTransfer.setData('text/plain', piece.id);
  event.dataTransfer.effectAllowed = 'move';
  select(piece);
});
document.addEventListener('dragend', () => {
  document
    .querySelectorAll('.drag-over')
    .forEach((el) => el.classList.remove('drag-over'));
  select(null);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') select(null);
});
$('shuffle').addEventListener('click', () => {
  makePieces();
  message('Puzzle wymieszane. Spróbuj ułożyć mapę jeszcze raz.');
});
