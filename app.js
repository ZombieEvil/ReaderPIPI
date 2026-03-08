import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

const DELIMITER = '%%%-%%%';
const APP_PIPI_KEY = 'var i = 14226-11420334e10';
const MIN_PIPI_DELIMITER_COUNT = 7;
const APP_VERSION = '3.3.0';
const RENDER_QUALITY_STORAGE_KEY = 'pipi-reader-render-quality';
const QUALITY_PRESETS = {
  standard: { multiplier: 1.35, maxOutputScale: 2.2, maxCssWidth: 1600, label: 'Standard' },
  high: { multiplier: 1.9, maxOutputScale: 3.2, maxCssWidth: 2000, label: 'Haute' },
  ultra: { multiplier: 2.5, maxOutputScale: 4, maxCssWidth: 2400, label: 'Ultra' },
};
const PROXY_STORAGE_KEY = 'pipi-reader-proxy-url';
const DEFAULT_PROXY_URL = 'https://readerpipi-proxy.zombievil909249.workers.dev';

const state = {
  books: [],
  activeBookId: null,
  activeChapterId: null,
  pdfRegistry: new Map(),
  reader: {
    candidateIndex: 0,
    renderToken: 0,
    mode: 'images',
    activeSourceUrl: '',
    quality: getSavedRenderQuality(),
  },
  proxyUrl: '',
};

const elements = {
  homeShell: document.getElementById('homeShell'),
  fileInput: document.getElementById('fileInput'),
  dropZone: document.getElementById('dropZone'),
  libraryList: document.getElementById('libraryList'),
  proxyUrlInput: document.getElementById('proxyUrlInput'),
  saveProxyBtn: document.getElementById('saveProxyBtn'),
  clearProxyBtn: document.getElementById('clearProxyBtn'),
  proxyHint: document.getElementById('proxyHint'),
  clearLibraryBtn: document.getElementById('clearLibraryBtn'),
  viewerTitle: document.getElementById('viewerTitle'),
  viewerSubtitle: document.getElementById('viewerSubtitle'),
  statusBar: document.getElementById('statusBar'),
  bookMeta: document.getElementById('bookMeta'),
  chapterPanel: document.getElementById('chapterPanel'),
  chapterList: document.getElementById('chapterList'),
  chapterCount: document.getElementById('chapterCount'),
  welcomeCard: document.getElementById('welcomeCard'),
  openLastReaderBtn: document.getElementById('openLastReaderBtn'),

  readerShell: document.getElementById('readerShell'),
  readerChapterSelect: document.getElementById('readerChapterSelect'),
  readerLastSelection: document.getElementById('readerLastSelection'),
  readerPrevBtn: document.getElementById('readerPrevBtn'),
  readerLatestBtn: document.getElementById('readerLatestBtn'),
  readerNextBtn: document.getElementById('readerNextBtn'),
  readerImagesBtn: document.getElementById('readerImagesBtn'),
  readerNativeBtn: document.getElementById('readerNativeBtn'),
  readerNewTabLink: document.getElementById('readerNewTabLink'),
  readerFullscreenBtn: document.getElementById('readerFullscreenBtn'),
  readerQualitySelect: document.getElementById('readerQualitySelect'),
  backToLibraryBtn: document.getElementById('backToLibraryBtn'),
  readerNotice: document.getElementById('readerNotice'),
  readerStage: document.getElementById('readerStage'),
  readerImageMode: document.getElementById('readerImageMode'),
  readerNativeMode: document.getElementById('readerNativeMode'),
  readerFrame: document.getElementById('readerFrame'),
  readerFallback: document.getElementById('readerFallback'),
  readerFallbackText: document.getElementById('readerFallbackText'),
  readerLoader: document.getElementById('readerLoader'),
  readerLoaderText: document.getElementById('readerLoaderText'),
  readerCanvasStack: document.getElementById('readerCanvasStack'),
};

state.proxyUrl = getSavedProxyUrl();
bindEvents();
renderProxyConfig();
renderLibrary();
renderHome();
syncRoute();

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

  elements.saveProxyBtn.addEventListener('click', () => {
    state.proxyUrl = normalizeProxyBase(elements.proxyUrlInput.value);
    saveProxyUrl(state.proxyUrl);
    renderProxyConfig();
    setStatus(state.proxyUrl ? 'Proxy PDF enregistré.' : 'Proxy PDF vidé.');
  });

  elements.clearProxyBtn.addEventListener('click', () => {
    state.proxyUrl = '';
    saveProxyUrl('');
    renderProxyConfig();
    setStatus('Proxy PDF vidé.');
  });

  elements.clearLibraryBtn.addEventListener('click', () => {
    for (const book of state.books) {
      if (book.kind === 'pdf' && book.objectUrl) {
        URL.revokeObjectURL(book.objectUrl);
      }
    }

    state.books = [];
    state.activeBookId = null;
    state.activeChapterId = null;
    state.pdfRegistry.clear();
    state.reader.renderToken += 1;
    elements.readerFrame.removeAttribute('src');
    elements.readerCanvasStack.innerHTML = '';
    renderLibrary();
    renderHome();
    setStatus('Bibliothèque vidée.');
    closeReader(true);
  });

  elements.openLastReaderBtn.addEventListener('click', () => {
    const activeBook = getActiveBook();
    const savedChapterId = getSavedLastChapterId(activeBook);
    const fallbackChapter = activeBook?.chapters?.[0];
    const targetChapterId = savedChapterId || fallbackChapter?.id;

    if (activeBook && targetChapterId) {
      openChapterInReader(activeBook.id, targetChapterId);
    }
  });

  elements.readerChapterSelect.addEventListener('change', () => {
    const activeBook = getActiveBook();
    if (!activeBook) return;
    openChapterInReader(activeBook.id, elements.readerChapterSelect.value);
  });

  elements.readerPrevBtn.addEventListener('click', () => moveReaderChapter(-1));
  elements.readerNextBtn.addEventListener('click', () => moveReaderChapter(1));

  elements.readerLatestBtn.addEventListener('click', () => {
    const activeBook = getActiveBook();
    if (!activeBook?.chapters?.length) return;
    const latest = activeBook.chapters[activeBook.chapters.length - 1];
    openChapterInReader(activeBook.id, latest.id);
  });

  elements.readerImagesBtn.addEventListener('click', () => {
    const book = getActiveBook();
    if (!book) return;
    setSavedReaderMode(book, 'images');
    renderReader();
  });

  elements.readerNativeBtn.addEventListener('click', () => {
    const book = getActiveBook();
    if (!book) return;
    setSavedReaderMode(book, 'native');
    renderReader();
  });

  elements.readerQualitySelect.addEventListener('change', () => {
    state.reader.quality = sanitizeRenderQuality(elements.readerQualitySelect.value);
    saveRenderQuality(state.reader.quality);
    if (!elements.readerShell.classList.contains('hidden') && getSavedReaderMode(getActiveBook()) === 'images') {
      renderReader();
    }
  });

  elements.backToLibraryBtn.addEventListener('click', () => closeReader());

  elements.readerFullscreenBtn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await elements.readerShell.requestFullscreen();
      }
    } catch (error) {
      console.warn('Plein écran impossible', error);
    }
  });

  document.addEventListener('fullscreenchange', () => {
    elements.readerFullscreenBtn.textContent = document.fullscreenElement ? 'Quitter plein écran' : 'Plein écran';
  });

  for (const swatch of document.querySelectorAll('.bg-swatch')) {
    swatch.addEventListener('click', () => {
      const activeBook = getActiveBook();
      if (!activeBook) return;
      setReaderTheme(activeBook, swatch.dataset.bg);
      renderReaderTheme(activeBook);
    });
  }

  window.addEventListener('hashchange', syncRoute);

  window.addEventListener('keydown', (event) => {
    if (elements.readerShell.classList.contains('hidden')) return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveReaderChapter(-1);
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveReaderChapter(1);
    }

    if (event.key === 'Escape' && !document.fullscreenElement) {
      closeReader();
    }
  });

  window.addEventListener('resize', debounce(() => {
    if (!elements.readerShell.classList.contains('hidden') && state.reader.mode === 'images') {
      renderReader();
    }
  }, 250));

  elements.readerFrame.addEventListener('load', () => {
    if (state.reader.mode !== 'native') return;
    elements.readerFallback.classList.add('hidden');
    const activeBook = getActiveBook();
    const chapter = getActiveChapter(activeBook);
    if (chapter) {
      elements.readerNotice.textContent = `${chapter.title} — lecteur PDF natif chargé.`;
    }
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
        importedCount += 1;
      } catch (error) {
        console.error(error);
        setStatus(`Impossible de lire ${file.name} : ${error.message}`);
      }
    }
  }

  renderLibrary();
  renderHome();

  if (importedCount > 0) {
    setStatus(`${importedCount} fichier(s) importé(s).`);
  }
}

function registerLocalPdf(file) {
  const id = crypto.randomUUID();
  const normalizedName = normalizeKey(file.name);
  const basename = normalizeKey(file.name.replace(/\.pdf$/i, ''));
  const numberMatch = basename.match(/(\d+)/);

  const objectUrl = URL.createObjectURL(file);

  const chapter = {
    id: crypto.randomUUID(),
    index: 1,
    title: file.name.replace(/\.pdf$/i, ''),
    normalizedTitle: basename,
    numberKey: numberMatch ? numberMatch[1] : null,
    localFile: file,
    localObjectUrl: objectUrl,
    url: '',
  };

  const book = {
    id,
    type: 'pdf',
    kind: 'pdf',
    title: file.name,
    file,
    objectUrl,
    normalizedName,
    basename,
    numberKey: numberMatch ? numberMatch[1] : null,
    meta: {
      title: file.name,
      description: 'PDF local importé',
      author: 'Local',
      artist: '—',
      status: 'Prêt à lire',
      language: 'Inconnue',
      publisher: 'Local',
      coverUrl: '',
    },
    chapters: [chapter],
  };

  state.pdfRegistry.set(id, book);
  state.books.unshift(book);
  state.activeBookId = id;
}

function parsePipiFile(raw, fileName) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) throw new Error('fichier vide');

  const detection = detectPipiPayload(trimmed);

  if (detection.kind === 'plain') {
    return {
      id: crypto.randomUUID(),
      type: 'pipi',
      kind: 'pipi-plain',
      fileName,
      encrypted: false,
      wasEncrypted: false,
      compatibility: 'native',
      ...parsePlainPipiText(trimmed, fileName),
    };
  }

  if (detection.kind === 'encrypted-supported') {
    return {
      id: crypto.randomUUID(),
      type: 'pipi',
      kind: 'pipi-plain',
      fileName,
      encrypted: false,
      wasEncrypted: true,
      compatibility: 'pipi-app-key',
      sourceFormat: 'openssl-base64-salted',
      ...parsePlainPipiText(detection.decryptedText, fileName),
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
  if (!looksEncrypted) return { kind: 'unknown' };

  const decryptedText = decryptWithKnownPipiKey(text);
  if (decryptedText && countPipiDelimiters(decryptedText) >= MIN_PIPI_DELIMITER_COUNT) {
    return {
      kind: 'encrypted-supported',
      decryptedText,
    };
  }

  return { kind: 'encrypted-unsupported' };
}

function decryptWithKnownPipiKey(cipherText) {
  try {
    const decrypted = window.CryptoJS.AES.decrypt(cipherText, APP_PIPI_KEY).toString(window.CryptoJS.enc.Utf8);
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
  if (!state.books.length) {
    elements.libraryList.className = 'library-list empty-state';
    elements.libraryList.textContent = 'Aucun fichier chargé.';
    return;
  }

  elements.libraryList.className = 'library-list';
  elements.libraryList.innerHTML = '';

  for (const book of state.books) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `library-item ${book.id === state.activeBookId ? 'active' : ''}`;

    item.innerHTML = `
      <div class="item-row">
        <div>
          <h4>${escapeHtml(book.title)}</h4>
          <p>${escapeHtml(getBookSubtitle(book))}</p>
        </div>
        <span class="item-type">${escapeHtml(getTypeLabel(book))}</span>
      </div>
    `;

    item.addEventListener('click', () => {
      state.activeBookId = book.id;
      state.activeChapterId = getSavedLastChapterId(book) || book.chapters?.[0]?.id || null;
      renderLibrary();
      renderHome();

      if (book.kind === 'pdf' && state.activeChapterId) {
        openChapterInReader(book.id, state.activeChapterId);
      }
    });

    elements.libraryList.appendChild(item);
  }
}

function renderHome() {
  const book = getActiveBook();

  if (!book) {
    elements.viewerTitle.textContent = 'Aucun contenu ouvert';
    elements.viewerSubtitle.textContent = 'Importe un .pipi ou un PDF puis clique sur un chapitre pour ouvrir le lecteur dédié.';
    elements.bookMeta.classList.add('hidden');
    elements.chapterPanel.classList.add('hidden');
    elements.openLastReaderBtn.classList.add('hidden');
    elements.welcomeCard.classList.remove('hidden');
    return;
  }

  elements.viewerTitle.textContent = book.title;
  elements.viewerSubtitle.textContent = book.kind === 'pdf'
    ? 'PDF local prêt à être ouvert dans le lecteur dédié.'
    : book.wasEncrypted
      ? 'Fichier .pipi chiffré compatible avec la clé connue de l’app Pipi.'
      : 'Bibliothèque chargée. Ouvre un chapitre dans la vue lecteur dédiée.';

  renderMeta(book);
  renderChapters(book);

  const savedChapterId = getSavedLastChapterId(book);
  const hasResume = Boolean(savedChapterId && book.chapters?.some((chapter) => chapter.id === savedChapterId));
  elements.openLastReaderBtn.classList.toggle('hidden', !hasResume);
  elements.welcomeCard.classList.add('hidden');
}

function renderMeta(book) {
  if (!book.meta) {
    elements.bookMeta.classList.add('hidden');
    return;
  }

  elements.bookMeta.classList.remove('hidden');
  elements.bookMeta.innerHTML = `
    <dl class="meta-grid">
      <div><dt>Titre</dt><dd>${escapeHtml(book.meta.title || book.title)}</dd></div>
      <div><dt>Description</dt><dd>${escapeHtml(book.meta.description || 'Aucune')}</dd></div>
      <div><dt>Auteur</dt><dd>${escapeHtml(book.meta.author || 'Inconnu')}</dd></div>
      <div><dt>Artiste</dt><dd>${escapeHtml(book.meta.artist || 'Inconnu')}</dd></div>
      <div><dt>Statut</dt><dd>${escapeHtml(book.meta.status || 'Inconnu')}</dd></div>
      <div><dt>Langue</dt><dd>${escapeHtml(book.meta.language || 'Inconnue')}</dd></div>
    </dl>
  `;
}

function renderChapters(book) {
  if (book.kind === 'pipi-protected-unsupported') {
    elements.chapterPanel.classList.remove('hidden');
    elements.chapterCount.textContent = '0 chapitre';
    elements.chapterList.innerHTML = `
      <div class="placeholder-card">
        <h3>Format protégé non encore compatible</h3>
        <p>Ce .pipi semble chiffré, mais il ne se déchiffre pas avec la clé compatible déjà trouvée dans l’app Pipi.</p>
      </div>
    `;
    return;
  }

  elements.chapterPanel.classList.remove('hidden');
  elements.chapterCount.textContent = `${book.chapters.length} chapitre(s)`;
  elements.chapterList.innerHTML = '';

  for (const chapter of book.chapters) {
    const localMatch = findLocalPdfForChapter(chapter);
    const hasRemote = Boolean(chapter.url);
    const sourceLabel = localMatch
      ? 'PDF local associé trouvé.'
      : hasRemote
        ? 'Source distante détectée dans le .pipi.'
        : 'Aucune source exploitable.';

    const item = document.createElement('div');
    item.className = `chapter-item ${chapter.id === state.activeChapterId ? 'active' : ''}`;
    item.innerHTML = `
      <div class="chapter-row">
        <div class="chapter-main">
          <div>
            <h4>${escapeHtml(chapter.title)}</h4>
            <p>${escapeHtml(sourceLabel)}</p>
            <div class="chapter-meta">
              ${localMatch ? '<span class="chapter-chip">PDF local</span>' : ''}
              ${hasRemote ? '<span class="chapter-chip">URL distante</span>' : ''}
              ${chapter.numberKey ? `<span class="chapter-chip">N° ${escapeHtml(chapter.numberKey)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="chapter-actions"></div>
      </div>
    `;

    const actions = item.querySelector('.chapter-actions');

    const openBtn = document.createElement('button');
    openBtn.className = 'primary-btn';
    openBtn.type = 'button';
    openBtn.textContent = 'Lire';
    openBtn.addEventListener('click', () => openChapterInReader(book.id, chapter.id));
    actions.appendChild(openBtn);

    if (chapter.url) {
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

function openChapterInReader(bookId, chapterId, replace = false) {
  state.activeBookId = bookId;
  state.activeChapterId = chapterId;
  state.reader.candidateIndex = 0;

  const hash = `#reader?book=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapterId)}`;
  if (replace) {
    history.replaceState(null, '', hash);
  } else {
    history.pushState(null, '', hash);
  }

  renderLibrary();
  renderHome();
  syncRoute();
}

function closeReader(replaceOnly = false) {
  state.reader.renderToken += 1;
  if (replaceOnly) {
    history.replaceState(null, '', '#');
  } else if (location.hash.startsWith('#reader')) {
    history.pushState(null, '', '#');
  }
  syncRoute();
}

function syncRoute() {
  const route = parseRoute();

  if (route.mode !== 'reader') {
    document.body.classList.remove('reader-mode');
    elements.homeShell.classList.remove('hidden');
    elements.readerShell.classList.add('hidden');
    return;
  }

  const book = state.books.find((entry) => entry.id === route.bookId);
  const chapter = book?.chapters?.find((entry) => entry.id === route.chapterId);

  if (!book || !chapter) {
    document.body.classList.remove('reader-mode');
    elements.homeShell.classList.remove('hidden');
    elements.readerShell.classList.add('hidden');
    setStatus('Impossible d’ouvrir cette vue lecteur : chapitre ou livre introuvable.');
    return;
  }

  state.activeBookId = book.id;
  state.activeChapterId = chapter.id;
  document.body.classList.add('reader-mode');
  elements.homeShell.classList.add('hidden');
  elements.readerShell.classList.remove('hidden');
  renderReader();
}

function parseRoute() {
  if (!location.hash.startsWith('#reader')) {
    return { mode: 'home' };
  }

  const [, queryString = ''] = location.hash.split('?');
  const params = new URLSearchParams(queryString);
  return {
    mode: 'reader',
    bookId: params.get('book') || '',
    chapterId: params.get('chapter') || '',
  };
}

async function renderReader() {
  const book = getActiveBook();
  const chapter = getActiveChapter(book);

  if (!book || !chapter) {
    elements.readerNotice.textContent = 'Impossible de charger ce chapitre.';
    showReaderFallback();
    return;
  }

  const source = getChapterSource(chapter);
  saveLastChapterId(book, chapter.id);

  renderReaderTheme(book);
  renderReaderHeader(book, chapter);
  renderReaderQualityUi();

  if (!source) {
    elements.readerNotice.textContent = 'Aucune source exploitable pour ce chapitre.';
    showReaderFallback();
    return;
  }

  const nativeCandidates = source.nativeCandidates?.length ? source.nativeCandidates : [source.url].filter(Boolean);
  const integratedCandidates = source.integratedCandidates?.length ? source.integratedCandidates : nativeCandidates;

  if (!nativeCandidates.length) {
    elements.readerNotice.textContent = 'Aucune URL exploitable trouvée.';
    showReaderFallback();
    return;
  }

  const candidateIndex = state.reader.candidateIndex % nativeCandidates.length;
  const activeNativeSrc = nativeCandidates[candidateIndex];
  const activeIntegratedSrc = integratedCandidates[Math.min(candidateIndex, integratedCandidates.length - 1)] || integratedCandidates[0] || activeNativeSrc;
  state.reader.activeSourceUrl = activeIntegratedSrc;
  elements.readerNewTabLink.href = source.newTabUrl || activeNativeSrc;

  const preferredMode = getSavedReaderMode(book);
  setReaderModeUi(preferredMode);

  const sourceText = nativeCandidates.length > 1 ? `Source ${candidateIndex + 1}/${nativeCandidates.length}.` : 'Source principale.';
  setStatus(`${chapter.title} ouvert dans la vue lecteur dédiée.`);

  if (preferredMode === 'native') {
    showNativeReader(activeNativeSrc, `${book.title} — ${chapter.title} — PDF natif. ${sourceText}`);
    return;
  }

  try {
    await showIntegratedPages(activeIntegratedSrc, book, chapter, sourceText);
  } catch (error) {
    console.error('Rendu intégré impossible', error);
    const isLocal = source.kind === 'file';
    if (isLocal) {
      showReaderFallback(`Le PDF local n’a pas pu être rendu en pages intégrées : ${error.message}`);
      return;
    }

    const help = state.proxyUrl
      ? 'Le proxy PDF configuré n’a pas réussi à récupérer la source distante.'
      : 'Cette source distante refuse le chargement JavaScript depuis GitHub Pages. Configure le proxy PDF pour afficher les pages directement dans le site.';
    showNativeReader(activeNativeSrc, `${book.title} — ${chapter.title} — fallback PDF natif. ${help}`);
  }
}

async function showIntegratedPages(sourceUrl, book, chapter, sourceText) {
  const token = ++state.reader.renderToken;
  state.reader.mode = 'images';
  setReaderModeUi('images');
  elements.readerFallback.classList.add('hidden');
  elements.readerNativeMode.classList.add('hidden');
  elements.readerImageMode.classList.remove('hidden');
  elements.readerLoader.classList.remove('hidden');
  elements.readerCanvasStack.classList.add('hidden');
  elements.readerCanvasStack.innerHTML = '';
  elements.readerFrame.removeAttribute('src');
  updateLoaderText('Ouverture du PDF…');

  const loadingTask = pdfjsLib.getDocument({
    url: sourceUrl,
    withCredentials: false,
    enableXfa: false,
    useWorkerFetch: true,
  });

  let pdfDocument;
  try {
    pdfDocument = await loadingTask.promise;
  } catch (error) {
    throw new Error(readablePdfError(error));
  }

  if (token !== state.reader.renderToken) {
    try { await pdfDocument.destroy(); } catch {}
    return;
  }

  const preset = getRenderPreset(state.reader.quality);
  const stageWidth = Math.max(320, Math.min(preset.maxCssWidth, elements.readerStage.clientWidth - 4));
  const targetWidth = stageWidth;
  const deviceRatio = Math.max(1, window.devicePixelRatio || 1);
  const outputScale = Math.max(1.4, Math.min(preset.maxOutputScale, deviceRatio * preset.multiplier));

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    if (token !== state.reader.renderToken) {
      try { await pdfDocument.destroy(); } catch {}
      return;
    }

    updateLoaderText(`Rendu de la page ${pageNumber} / ${pdfDocument.numPages}…`);
    const page = await pdfDocument.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const cssScale = targetWidth / baseViewport.width;
    const cssWidth = Math.floor(baseViewport.width * cssScale);
    const cssHeight = Math.floor(baseViewport.height * cssScale);
    const viewport = page.getViewport({ scale: cssScale * outputScale });

    const wrapper = document.createElement('section');
    wrapper.className = 'reader-page';
    wrapper.dataset.page = String(pageNumber);
    wrapper.style.width = `${cssWidth}px`;

    const canvas = document.createElement('canvas');
    canvas.className = 'reader-page-canvas';
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    wrapper.appendChild(canvas);

    elements.readerCanvasStack.appendChild(wrapper);

    const context = canvas.getContext('2d', { alpha: false });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    await page.render({
      canvasContext: context,
      viewport,
      intent: 'display',
      annotationMode: pdfjsLib.AnnotationMode.DISABLE,
    }).promise;
    page.cleanup();
  }

  if (token !== state.reader.renderToken) {
    try { await pdfDocument.destroy(); } catch {}
    return;
  }

  elements.readerLoader.classList.add('hidden');
  elements.readerCanvasStack.classList.remove('hidden');
  elements.readerNotice.textContent = `${book.title} — ${chapter.title} — pages intégrées chargées. ${sourceText}`;
  try { await pdfDocument.destroy(); } catch {}
}

function showNativeReader(sourceUrl, notice) {
  state.reader.mode = 'native';
  setReaderModeUi('native');
  elements.readerImageMode.classList.add('hidden');
  elements.readerNativeMode.classList.remove('hidden');
  elements.readerFallback.classList.add('hidden');
  elements.readerCanvasStack.innerHTML = '';
  elements.readerFrame.src = appendPdfFragment(sourceUrl);
  elements.readerNotice.textContent = notice;
}

function showReaderFallback(message = '') {
  elements.readerImageMode.classList.add('hidden');
  elements.readerNativeMode.classList.add('hidden');
  elements.readerLoader.classList.add('hidden');
  elements.readerCanvasStack.innerHTML = '';
  elements.readerFrame.removeAttribute('src');
  elements.readerFallback.classList.remove('hidden');
  if (message) {
    elements.readerFallbackText.textContent = message;
  } else {
    elements.readerFallbackText.textContent = 'La source distante refuse probablement le chargement JavaScript du PDF. Configure le proxy PDF, ou utilise PDF natif / Nouvel onglet.';
  }
}

function renderReaderQualityUi() {
  if (!elements.readerQualitySelect) return;
  elements.readerQualitySelect.value = sanitizeRenderQuality(state.reader.quality);
}

function renderReaderHeader(book, chapter) {
  elements.readerChapterSelect.innerHTML = book.chapters
    .map((entry) => `<option value="${escapeAttribute(entry.id)}" ${entry.id === chapter.id ? 'selected' : ''}>${escapeHtml(entry.title)}</option>`)
    .join('');

  const lastChapterId = getSavedLastChapterId(book);
  const lastChapter = book.chapters.find((entry) => entry.id === lastChapterId) || chapter;
  elements.readerLastSelection.textContent = lastChapter?.title || 'Aucune';

  const index = book.chapters.findIndex((entry) => entry.id === chapter.id);
  elements.readerPrevBtn.disabled = index <= 0;
  elements.readerNextBtn.disabled = index >= book.chapters.length - 1;
  elements.readerLatestBtn.disabled = index === book.chapters.length - 1;
}

function moveReaderChapter(delta) {
  const book = getActiveBook();
  const chapter = getActiveChapter(book);
  if (!book || !chapter) return;

  const index = book.chapters.findIndex((entry) => entry.id === chapter.id);
  if (index === -1) return;

  const target = book.chapters[index + delta];
  if (target) {
    openChapterInReader(book.id, target.id);
  }
}

function setReaderModeUi(mode) {
  elements.readerImagesBtn.classList.toggle('primary-btn', mode === 'images');
  elements.readerImagesBtn.classList.toggle('ghost-btn', mode !== 'images');
  elements.readerNativeBtn.classList.toggle('primary-btn', mode === 'native');
  elements.readerNativeBtn.classList.toggle('ghost-btn', mode !== 'native');
}

function renderReaderTheme(book) {
  const theme = getSavedReaderTheme(book);
  elements.readerStage.classList.remove('theme-midnight', 'theme-paper', 'theme-black');
  elements.readerStage.classList.add(`theme-${theme}`);

  for (const swatch of document.querySelectorAll('.bg-swatch')) {
    swatch.classList.toggle('active', swatch.dataset.bg === theme);
  }
}

function setReaderTheme(book, theme) {
  localStorage.setItem(getReaderThemeStorageKey(book), theme);
}

function getRenderPreset(key) {
  return QUALITY_PRESETS[sanitizeRenderQuality(key)] || QUALITY_PRESETS.high;
}

function sanitizeRenderQuality(value) {
  return Object.prototype.hasOwnProperty.call(QUALITY_PRESETS, value) ? value : 'high';
}

function getSavedRenderQuality() {
  try {
    return sanitizeRenderQuality(localStorage.getItem(RENDER_QUALITY_STORAGE_KEY) || 'high');
  } catch {
    return 'high';
  }
}

function saveRenderQuality(value) {
  try {
    localStorage.setItem(RENDER_QUALITY_STORAGE_KEY, sanitizeRenderQuality(value));
  } catch {}
}

function getSavedReaderTheme(book) {
  const saved = localStorage.getItem(getReaderThemeStorageKey(book));
  return ['midnight', 'paper', 'black'].includes(saved) ? saved : 'midnight';
}

function getReaderThemeStorageKey(book) {
  return `pipi-reader-theme:${normalizeKey(book?.title || 'book')}`;
}

function getSavedReaderMode(book) {
  const saved = localStorage.getItem(`pipi-reader-mode:${book?.id || ''}`);
  return ['images', 'native'].includes(saved) ? saved : 'images';
}

function setSavedReaderMode(book, mode) {
  localStorage.setItem(`pipi-reader-mode:${book?.id || ''}`, mode);
}

function getSavedLastChapterId(book) {
  if (!book) return '';
  return localStorage.getItem(`pipi-last-chapter:${book.id}`) || '';
}

function saveLastChapterId(book, chapterId) {
  if (!book || !chapterId) return;
  localStorage.setItem(`pipi-last-chapter:${book.id}`, chapterId);
}

function getChapterSource(chapter) {
  const localMatch = chapter.localObjectUrl
    ? { file: chapter.localFile, objectUrl: chapter.localObjectUrl }
    : findLocalPdfForChapter(chapter);

  if (localMatch?.objectUrl) {
    return {
      kind: 'file',
      newTabUrl: localMatch.objectUrl,
      nativeCandidates: [localMatch.objectUrl],
      integratedCandidates: [localMatch.objectUrl],
    };
  }

  if (chapter.url) {
    const remote = buildRemoteConfig(chapter.url);
    return {
      kind: 'url',
      newTabUrl: remote.newTabUrl,
      nativeCandidates: remote.nativeCandidates,
      integratedCandidates: remote.integratedCandidates,
      proxyCapable: remote.proxyCapable,
    };
  }

  return null;
}

function buildRemoteConfig(rawUrl) {
  const nativeCandidates = [];
  const push = (url) => {
    if (url && !nativeCandidates.includes(url)) nativeCandidates.push(url);
  };

  let proxyCapable = false;

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const isDropbox = ['www.dropbox.com', 'dropbox.com', 'dl.dropbox.com', 'dl.dropboxusercontent.com'].includes(host);
    proxyCapable = parsed.protocol === 'https:';

    if (isDropbox) {
      const rawOnMain = new URL(parsed.toString());
      rawOnMain.hostname = 'www.dropbox.com';
      rawOnMain.searchParams.delete('dl');
      rawOnMain.searchParams.set('raw', '1');
      push(rawOnMain.toString());

      const rawOnDl = new URL(parsed.toString());
      rawOnDl.hostname = 'dl.dropbox.com';
      rawOnDl.searchParams.delete('dl');
      rawOnDl.searchParams.set('raw', '1');
      push(rawOnDl.toString());

      const rawOnUserContent = new URL(parsed.toString());
      rawOnUserContent.hostname = 'dl.dropboxusercontent.com';
      rawOnUserContent.searchParams.delete('dl');
      rawOnUserContent.searchParams.set('raw', '1');
      push(rawOnUserContent.toString());
    }

    push(parsed.toString());
  } catch (error) {
    console.warn('Impossible de construire des variantes distantes', error);
    push(rawUrl);
  }

  const integratedCandidates = [];
  const proxyBase = state.proxyUrl;
  if (proxyBase) {
    for (const url of nativeCandidates) {
      const proxied = buildProxiedUrl(proxyBase, url);
      if (proxied && !integratedCandidates.includes(proxied)) integratedCandidates.push(proxied);
    }
  }

  for (const url of nativeCandidates) {
    if (!integratedCandidates.includes(url)) integratedCandidates.push(url);
  }

  return {
    newTabUrl: nativeCandidates[0] || rawUrl,
    nativeCandidates,
    integratedCandidates,
    proxyCapable,
  };
}

function findLocalPdfForChapter(chapter) {
  return state.books.find((book) => {
    if (book.kind !== 'pdf') return false;
    const pdfChapter = book.chapters?.[0];

    if (chapter.numberKey && book.numberKey && chapter.numberKey === book.numberKey) return true;
    if (chapter.normalizedTitle && book.basename && chapter.normalizedTitle.includes(book.basename)) return true;
    if (chapter.normalizedTitle && pdfChapter?.normalizedTitle && chapter.normalizedTitle === pdfChapter.normalizedTitle) return true;
    return false;
  }) || null;
}

function getTypeLabel(book) {
  if (book.kind === 'pdf') return '.pdf';
  if (book.kind === 'pipi-protected-unsupported') return '.pipi protégé';
  if (book.wasEncrypted) return '.pipi déchiffré';
  return '.pipi';
}

function getBookSubtitle(book) {
  if (book.kind === 'pdf') return 'Lecture locale';
  if (book.kind === 'pipi-protected-unsupported') return 'Format protégé non compatible';
  if (book.wasEncrypted) return `${book.chapters.length} chapitre(s) · clé Pipi détectée`;
  return `${book.chapters.length} chapitre(s)`;
}

function getActiveBook() {
  return state.books.find((book) => book.id === state.activeBookId) || null;
}

function getActiveChapter(book = getActiveBook()) {
  if (!book) return null;
  return book.chapters?.find((chapter) => chapter.id === state.activeChapterId) || null;
}

function setStatus(message) {
  elements.statusBar.textContent = message;
}

function updateLoaderText(message) {
  elements.readerLoaderText.textContent = message;
}

function appendPdfFragment(url) {
  if (!url) return '';
  return url.includes('#') ? url : `${url}#toolbar=1&view=FitH`;
}

function readablePdfError(error) {
  const message = String(error?.message || error || 'Erreur inconnue');
  if (/fetch|network|cors|failed to fetch/i.test(message)) return 'chargement refusé par la source distante (CORS ou lien non autorisé)';
  return message;
}

function renderProxyConfig() {
  elements.proxyUrlInput.value = state.proxyUrl || '';
  elements.proxyHint.textContent = state.proxyUrl
    ? `Proxy actif : ${state.proxyUrl}`
    : 'Sans proxy, les PDFs Dropbox restent bloqués pour le rendu intégré à cause du CORS.';
}

function getSavedProxyUrl() {
  return normalizeProxyBase(localStorage.getItem(PROXY_STORAGE_KEY) || DEFAULT_PROXY_URL);
}

function saveProxyUrl(value) {
  const normalized = normalizeProxyBase(value);
  if (!normalized) {
    localStorage.removeItem(PROXY_STORAGE_KEY);
    return;
  }
  localStorage.setItem(PROXY_STORAGE_KEY, normalized);
}

function normalizeProxyBase(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function buildProxiedUrl(proxyBase, targetUrl) {
  const base = normalizeProxyBase(proxyBase);
  if (!base || !targetUrl) return '';
  const proxyUrl = new URL(base);
  proxyUrl.searchParams.set('url', targetUrl);
  return proxyUrl.toString();
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
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

function debounce(fn, delay = 200) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}
