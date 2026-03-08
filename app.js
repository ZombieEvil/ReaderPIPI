const DELIMITER = '%%%-%%%';
const APP_PIPI_KEY = 'var i = 14226-11420334e10';
const MIN_PIPI_DELIMITER_COUNT = 7;
const APP_VERSION = '2.1.0';

const state = {
  books: [],
  activeBookId: null,
  activeChapterId: null,
  activeSource: null,
  renderToken: 0,
  zoom: Number(localStorage.getItem('pipiZoom') || 1),
  pdfRegistry: new Map(),
};

const elements = {
  fileInput: document.getElementById('fileInput'),
  dropZone: document.getElementById('dropZone'),
  libraryList: document.getElementById('libraryList'),
  clearLibraryBtn: document.getElementById('clearLibraryBtn'),
  viewer: document.getElementById('viewer'),
  viewerTitle: document.getElementById('viewerTitle'),
  viewerSubtitle: document.getElementById('viewerSubtitle'),
  statusBar: document.getElementById('statusBar'),
  bookMeta: document.getElementById('bookMeta'),
  chapterPanel: document.getElementById('chapterPanel'),
  chapterList: document.getElementById('chapterList'),
  chapterCount: document.getElementById('chapterCount'),
  zoomRange: document.getElementById('zoomRange'),
  rerenderBtn: document.getElementById('rerenderBtn'),
};

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

elements.zoomRange.value = String(state.zoom);

bindEvents();
renderLibrary();
renderBookArea();
resetViewer();

function bindEvents() {
  elements.fileInput.addEventListener('change', async (event) => {
    await handleFiles(event.target.files);
    event.target.value = '';
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (eventName === 'drop') {
        handleFiles(event.dataTransfer.files);
      }
      elements.dropZone.classList.remove('dragover');
    });
  });

  elements.clearLibraryBtn.addEventListener('click', () => {
    state.books = [];
    state.activeBookId = null;
    state.activeChapterId = null;
    state.activeSource = null;
    state.pdfRegistry.clear();
    renderLibrary();
    renderBookArea();
    resetViewer();
    setStatus('Bibliothèque vidée.');
  });

  elements.zoomRange.addEventListener('input', () => {
    state.zoom = Number(elements.zoomRange.value);
    localStorage.setItem('pipiZoom', String(state.zoom));
  });

  elements.rerenderBtn.addEventListener('click', async () => {
    if (!state.activeSource) {
      setStatus('Aucun document à recharger.');
      return;
    }
    await renderPdf(state.activeSource);
  });
}

async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  let importedCount = 0;

  for (const file of files) {
    const lower = file.name.toLowerCase();

    if (lower.endsWith('.pdf')) {
      registerLocalPdf(file);
      importedCount += 1;
      continue;
    }

    if (lower.endsWith('.pipi')) {
      try {
        const raw = await file.text();
        const book = parsePipiFile(raw, file.name);
        state.books.unshift(book);
        state.activeBookId = book.id;
        state.activeChapterId = null;
        importedCount += 1;
      } catch (error) {
        console.error(error);
        setStatus(`Impossible de lire ${file.name} : ${error.message}`);
      }
      continue;
    }

    setStatus(`Format ignoré : ${file.name}`);
  }

  renderLibrary();
  renderBookArea();

  if (importedCount > 0) {
    setStatus(`${importedCount} fichier(s) importé(s). · moteur ${APP_VERSION}`);
  }
}

function registerLocalPdf(file) {
  const pdfId = crypto.randomUUID();
  const normalizedName = normalizeKey(file.name);
  const basename = normalizeKey(file.name.replace(/\.pdf$/i, ''));
  const numberMatch = basename.match(/(\d+)/);

  const pdfEntry = {
    id: pdfId,
    type: 'pdf',
    kind: 'pdf',
    title: file.name,
    file,
    normalizedName,
    basename,
    numberKey: numberMatch ? numberMatch[1] : null,
  };

  state.pdfRegistry.set(pdfId, pdfEntry);
  state.books.unshift(pdfEntry);
  state.activeBookId = pdfId;
}

function parsePipiFile(raw, fileName) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    throw new Error('fichier vide');
  }

  const detection = detectPipiPayload(trimmed);

  if (detection.kind === 'plain') {
    const parsed = parsePlainPipiText(trimmed, fileName);
    return {
      id: crypto.randomUUID(),
      type: 'pipi',
      kind: 'pipi-plain',
      fileName,
      encrypted: false,
      wasEncrypted: false,
      compatibility: 'native',
      ...parsed,
    };
  }

  if (detection.kind === 'encrypted-supported') {
    const parsed = parsePlainPipiText(detection.decryptedText, fileName);
    return {
      id: crypto.randomUUID(),
      type: 'pipi',
      kind: 'pipi-plain',
      fileName,
      encrypted: false,
      wasEncrypted: true,
      compatibility: 'pipi-app-key',
      sourceFormat: 'openssl-base64-salted',
      ...parsed,
    };
  }

  if (detection.kind === 'encrypted-unsupported') {
    return {
      id: crypto.randomUUID(),
      type: 'pipi',
      kind: 'pipi-protected-unsupported',
      fileName,
      title: fileName,
      encrypted: true,
      wasEncrypted: true,
      compatibility: 'unknown',
      sourceFormat: 'openssl-base64-salted',
      rawPayload: trimmed,
      meta: null,
      chapters: [],
    };
  }

  throw new Error('structure .pipi non reconnue');
}

function detectPipiPayload(text) {
  if (countPipiDelimiters(text) >= MIN_PIPI_DELIMITER_COUNT) {
    return { kind: 'plain' };
  }

  const looksEncrypted = text.startsWith('U2FsdGVkX1');
  if (!looksEncrypted) {
    return { kind: 'unknown' };
  }

  const decryptedText = decryptWithKnownPipiKey(text);
  if (decryptedText && countPipiDelimiters(decryptedText) >= MIN_PIPI_DELIMITER_COUNT) {
    return {
      kind: 'encrypted-supported',
      decryptedText,
    };
  }

  return {
    kind: 'encrypted-unsupported',
  };
}

function decryptWithKnownPipiKey(cipherText) {
  try {
    const decrypted = CryptoJS.AES.decrypt(cipherText, APP_PIPI_KEY).toString(CryptoJS.enc.Utf8);
    return decrypted?.trim() || '';
  } catch (error) {
    console.error('Déchiffrement .pipi impossible', error);
    return '';
  }
}

function countPipiDelimiters(text) {
  return (String(text || '').match(/%%%-%%%/g) || []).length;
}

function parsePlainPipiText(text, fileName) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length || !lines[0].includes(DELIMITER)) {
    throw new Error('structure .pipi non reconnue');
  }

  const metaParts = lines[0].split(DELIMITER).map((part) => part.trim());
  if (metaParts.length < 2) {
    throw new Error('métadonnées .pipi invalides');
  }

  const [title, description, author, artist, status, language, publisher, coverUrl] = metaParts;

  const chapters = lines.slice(1).map((line, index) => {
    const [chapterTitle, chapterUrl] = line.split(DELIMITER).map((part) => part?.trim() || '');
    const normalizedTitle = normalizeKey(chapterTitle || `Chapitre ${index + 1}`);
    const numberMatch = chapterTitle?.match(/(\d+)/);
    const urlNumberMatch = chapterUrl?.match(/(?:\/|^)(\d+)\.pdf(?:\?|$)/i);

    return {
      id: crypto.randomUUID(),
      index: index + 1,
      title: chapterTitle || `Chapitre ${index + 1}`,
      url: chapterUrl,
      normalizedTitle,
      numberKey: numberMatch?.[1] || urlNumberMatch?.[1] || null,
    };
  });

  return {
    title: title || fileName,
    meta: {
      title: title || fileName,
      description: description || 'Aucune description',
      author: author || 'Inconnu',
      artist: artist || 'Inconnu',
      status: status || 'Inconnu',
      language: language || 'Inconnue',
      publisher: publisher || 'Inconnu',
      coverUrl: coverUrl || '',
    },
    chapters,
  };
}

function renderLibrary() {
  const list = elements.libraryList;

  if (!state.books.length) {
    list.className = 'library-list empty-state';
    list.textContent = 'Aucun fichier chargé.';
    return;
  }

  list.className = 'library-list';
  list.innerHTML = '';

  for (const book of state.books) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `library-item ${book.id === state.activeBookId ? 'active' : ''}`;

    const typeLabel = getTypeLabel(book);
    const subtitle = getBookSubtitle(book);

    item.innerHTML = `
      <div class="item-row">
        <div>
          <h4>${escapeHtml(book.title)}</h4>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <span class="item-type">${escapeHtml(typeLabel)}</span>
      </div>
    `;

    item.addEventListener('click', () => {
      state.activeBookId = book.id;
      state.activeChapterId = null;
      renderLibrary();
      renderBookArea();
      if (book.kind === 'pdf') {
        openStandalonePdf(book.id);
      }
    });

    list.appendChild(item);
  }
}

function getTypeLabel(book) {
  if (book.kind === 'pdf') return 'PDF local';
  if (book.kind === 'pipi-protected-unsupported') return '.pipi protégé';
  if (book.wasEncrypted) return '.pipi auto-déverrouillé';
  return '.pipi';
}

function getBookSubtitle(book) {
  if (book.kind === 'pdf') return 'Lecture directe';
  if (book.kind === 'pipi-protected-unsupported') return 'Format protégé non encore compatible';
  if (book.wasEncrypted) return `${book.chapters.length} chapitre(s) · clé Pipi détectée`;
  return `${book.chapters.length} chapitre(s)`;
}

function renderBookArea() {
  const activeBook = getActiveBook();

  if (!activeBook) {
    elements.viewerTitle.textContent = 'Aucun contenu ouvert';
    elements.viewerSubtitle.textContent = 'Charge un .pipi ou un PDF pour commencer.';
    elements.bookMeta.classList.add('hidden');
    elements.chapterPanel.classList.add('hidden');
    return;
  }

  elements.viewerTitle.textContent = activeBook.title;

  if (activeBook.kind === 'pdf') {
    elements.viewerSubtitle.textContent = 'PDF local prêt à être lu.';
    elements.bookMeta.classList.add('hidden');
    elements.chapterPanel.classList.add('hidden');
    return;
  }

  if (activeBook.kind === 'pipi-protected-unsupported') {
    elements.viewerSubtitle.textContent = 'Fichier .pipi protégé détecté.';
    elements.bookMeta.classList.add('hidden');
    elements.chapterPanel.classList.add('hidden');
    renderUnsupportedProtectedView(activeBook);
    return;
  }

  const decryptionBadge = activeBook.wasEncrypted
    ? 'Déverrouillé automatiquement avec la compatibilité Pipi.'
    : `${activeBook.chapters.length} chapitre(s) détecté(s).`;

  elements.viewerSubtitle.textContent = decryptionBadge;
  renderMeta(activeBook.meta, activeBook);
  renderChapters(activeBook);
  if (!state.activeChapterId) {
    elements.viewer.className = 'viewer empty-viewer';
    elements.viewer.innerHTML = `
      <div class="placeholder-card">
        <h3>${escapeHtml(activeBook.title)}</h3>
        <p>Sélectionne un chapitre pour lancer la lecture.</p>
      </div>
    `;
  }
}

function renderMeta(meta, book) {
  if (!meta) {
    elements.bookMeta.classList.add('hidden');
    return;
  }

  const cover = meta.coverUrl
    ? `<img class="cover-preview" src="${escapeAttribute(meta.coverUrl)}" alt="Couverture" onerror="this.style.display='none'" />`
    : `<div class="cover-preview"></div>`;

  const compatHtml = book?.wasEncrypted
    ? `
      <div class="meta-pill-row">
        <span class="meta-pill meta-pill-success">.pipi protégé décodé automatiquement</span>
        <span class="meta-pill">clé intégrée Pipi détectée</span>
      </div>
    `
    : '';

  elements.bookMeta.innerHTML = `
    <div class="book-meta-grid">
      <div>${cover}</div>
      <div>
        ${compatHtml}
        <div class="meta-grid">
          <dl><dt>Titre</dt><dd>${escapeHtml(meta.title)}</dd></dl>
          <dl><dt>Auteur</dt><dd>${escapeHtml(meta.author)}</dd></dl>
          <dl><dt>Artiste</dt><dd>${escapeHtml(meta.artist)}</dd></dl>
          <dl><dt>Statut</dt><dd>${escapeHtml(meta.status)}</dd></dl>
          <dl><dt>Langue</dt><dd>${escapeHtml(meta.language)}</dd></dl>
          <dl><dt>Éditeur / source</dt><dd>${escapeHtml(meta.publisher)}</dd></dl>
        </div>
        <p class="book-description">${escapeHtml(meta.description)}</p>
      </div>
    </div>
  `;
  elements.bookMeta.classList.remove('hidden');
}

function renderChapters(book) {
  elements.chapterPanel.classList.remove('hidden');
  elements.chapterCount.textContent = `${book.chapters.length} chapitre(s)`;
  elements.chapterList.innerHTML = '';

  for (const chapter of book.chapters) {
    const localMatch = findLocalPdfForChapter(chapter);
    const item = document.createElement('div');
    item.className = `chapter-item ${chapter.id === state.activeChapterId ? 'active' : ''}`;

    const sourceDescription = localMatch
      ? 'PDF local associé trouvé.'
      : chapter.url
        ? 'Source distante détectée dans le .pipi.'
        : 'Aucune source exploitable.';

    item.innerHTML = `
      <div class="chapter-row">
        <div>
          <h4>${escapeHtml(chapter.title)}</h4>
          <p>${escapeHtml(sourceDescription)}</p>
        </div>
        <div class="chapter-actions"></div>
      </div>
    `;

    const actions = item.querySelector('.chapter-actions');

    if (localMatch) {
      const localBtn = document.createElement('button');
      localBtn.className = 'primary-btn';
      localBtn.type = 'button';
      localBtn.textContent = 'Ouvrir local';
      localBtn.addEventListener('click', async () => {
        state.activeChapterId = chapter.id;
        renderChapters(book);
        await renderPdf({
          type: 'file',
          label: `${book.title} — ${chapter.title}`,
          file: localMatch.file,
        });
      });
      actions.appendChild(localBtn);
    }

    if (chapter.url) {
      const remoteBtn = document.createElement('button');
      remoteBtn.className = localMatch ? 'secondary-btn' : 'primary-btn';
      remoteBtn.type = 'button';
      remoteBtn.textContent = localMatch ? 'Ouvrir URL' : 'Lire en ligne';
      remoteBtn.addEventListener('click', async () => {
        state.activeChapterId = chapter.id;
        renderChapters(book);
        await renderPdf(buildRemotePdfSource(`${book.title} — ${chapter.title}`, chapter.url));
      });
      actions.appendChild(remoteBtn);

      const linkBtn = document.createElement('a');
      linkBtn.className = 'ghost-btn';
      linkBtn.href = chapter.url;
      linkBtn.target = '_blank';
      linkBtn.rel = 'noopener noreferrer';
      linkBtn.textContent = 'Lien brut';
      actions.appendChild(linkBtn);
    }

    elements.chapterList.appendChild(item);
  }
}

function renderUnsupportedProtectedView(book) {
  elements.viewer.className = 'viewer';
  elements.viewer.innerHTML = `
    <div class="unlock-card">
      <h4>${escapeHtml(book.title)}</h4>
      <p>
        Ce fichier <strong>.pipi</strong> semble protégé, mais il n'a pas pu être décodé avec la compatibilité connue de l'application Pipi.
      </p>
      <div class="message error">
        Le faux écran “entre un mot de passe” a été retiré : ce prototype n'invente plus de mot de passe quand le format n'est pas reconnu.
      </div>
      <p class="small-note">
        Conclusion actuelle : soit le fichier utilise une autre version du format, soit une autre clé, soit une structure propriétaire différente.
      </p>
    </div>
  `;
}

function buildRemotePdfSource(label, rawUrl) {
  return {
    type: 'url',
    label,
    url: rawUrl,
    urls: buildRemoteCandidates(rawUrl),
  };
}

function buildRemoteCandidates(rawUrl) {
  const candidates = [rawUrl];

  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.includes('dropbox.com')) {
      const directDownload = new URL(parsed.toString());
      directDownload.searchParams.set('dl', '1');
      candidates.push(directDownload.toString());

      const rawVariant = new URL(parsed.toString());
      rawVariant.searchParams.delete('dl');
      rawVariant.searchParams.set('raw', '1');
      candidates.push(rawVariant.toString());
    }
  } catch (error) {
    console.warn('Impossible de construire des variantes d’URL', error);
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function getActiveBook() {
  return state.books.find((book) => book.id === state.activeBookId) || null;
}

function openStandalonePdf(bookId) {
  const book = state.books.find((item) => item.id === bookId && item.kind === 'pdf');
  if (!book) return;

  renderPdf({
    type: 'file',
    label: book.title,
    file: book.file,
  });
}

async function renderPdf(source) {
  state.activeSource = source;
  state.renderToken += 1;
  const token = state.renderToken;

  elements.viewer.className = 'viewer';
  elements.viewer.innerHTML = '';
  setStatus(`Chargement de ${source.label}…`);

  try {
    const pdfDocument = await loadPdfDocument(source);
    if (token !== state.renderToken) return;

    const { pdf, resolvedFrom } = pdfDocument;
    if (resolvedFrom) {
      source.resolvedFrom = resolvedFrom;
    }

    setStatus(`${source.label} — ${pdf.numPages} page(s). Rendu en cours…`);

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (token !== state.renderToken) return;

      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: state.zoom * 1.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      const shell = document.createElement('div');
      shell.className = 'page-shell';
      shell.innerHTML = `<div class="page-label">Page ${pageNumber} / ${pdf.numPages}</div>`;
      shell.appendChild(canvas);
      elements.viewer.appendChild(shell);

      await page.render({ canvasContext: context, viewport }).promise;
      setStatus(`${source.label} — page ${pageNumber}/${pdf.numPages}`);
    }

    setStatus(`${source.label} — rendu terminé (${pdf.numPages} page(s)).`);
  } catch (error) {
    console.error(error);
    const detail = source.type === 'url'
      ? 'Le lien distant peut être bloqué par CORS, inaccessible, ou nécessiter une variante directe.'
      : 'Le PDF local n’a pas pu être lu.';

    const variantsHtml = source.type === 'url' && Array.isArray(source.urls) && source.urls.length > 1
      ? `<p class="small-note">Variantes essayées : ${escapeHtml(source.urls.length.toString())}</p>`
      : '';

    elements.viewer.innerHTML = `
      <div class="unlock-card">
        <h4>Lecture impossible</h4>
        <p>${escapeHtml(detail)}</p>
        <p class="message error">${escapeHtml(error.message || 'Erreur inconnue')}</p>
        ${variantsHtml}
        ${source.type === 'url' ? `<p><a class="ghost-btn" href="${escapeAttribute(source.url)}" target="_blank" rel="noopener noreferrer">Ouvrir le lien dans un nouvel onglet</a></p>` : ''}
      </div>
    `;

    setStatus(`Échec de lecture : ${error.message}`);
  }
}

async function loadPdfDocument(source) {
  if (source.type === 'file') {
    const bytes = await source.file.arrayBuffer();
    const task = pdfjsLib.getDocument({ data: bytes });
    const pdf = await task.promise;
    return { pdf, resolvedFrom: 'file' };
  }

  if (source.type === 'url') {
    let lastError = new Error('Impossible de charger ce PDF distant.');

    for (const candidate of source.urls || [source.url]) {
      try {
        const task = pdfjsLib.getDocument({ url: candidate, withCredentials: false });
        const pdf = await task.promise;
        return { pdf, resolvedFrom: candidate };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  throw new Error('source PDF inconnue');
}

function findLocalPdfForChapter(chapter) {
  const localPdfs = state.books.filter((book) => book.kind === 'pdf');

  return localPdfs.find((pdf) => {
    if (chapter.numberKey && pdf.numberKey && chapter.numberKey === pdf.numberKey) return true;
    if (chapter.normalizedTitle && pdf.basename && chapter.normalizedTitle.includes(pdf.basename)) return true;
    return false;
  }) || null;
}

function resetViewer() {
  elements.viewer.className = 'viewer empty-viewer';
  elements.viewer.innerHTML = `
    <div class="placeholder-card">
      <h3>Prêt à lire</h3>
      <p>
        Le site prend en charge :
        <strong>PDF locaux</strong>,
        <strong>.pipi en clair</strong>
        et les <strong>.pipi chiffrés compatibles avec la clé connue de l’app Pipi</strong>.
      </p>
      <p>
        Astuce : si ton .pipi contient des chapitres distants nommés “Chapitre 1”, “Chapitre 2”…
        et que tu as aussi des fichiers locaux “1.pdf”, “2.pdf”… le lecteur essaie de les associer automatiquement.
      </p>
    </div>
  `;
}

function setStatus(message) {
  elements.statusBar.textContent = message;
}

function normalizeKey(value) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
