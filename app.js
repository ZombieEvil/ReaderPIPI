const DELIMITER = '%%%-%%%';
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
    setStatus(`${importedCount} fichier(s) importé(s).`);
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
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('fichier vide');
  }

  const isEncrypted = trimmed.startsWith('U2FsdGVkX1');

  if (isEncrypted) {
    return {
      id: crypto.randomUUID(),
      type: 'pipi',
      kind: 'pipi-encrypted',
      fileName,
      title: fileName,
      encryptedPayload: trimmed,
      encrypted: true,
      meta: null,
      chapters: [],
    };
  }

  const parsed = parsePlainPipiText(trimmed, fileName);
  return {
    id: crypto.randomUUID(),
    type: 'pipi',
    kind: 'pipi-plain',
    fileName,
    encrypted: false,
    ...parsed,
  };
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

    const typeLabel = book.kind === 'pdf'
      ? 'PDF local'
      : book.encrypted
        ? '.pipi chiffré'
        : '.pipi';

    const subtitle = book.kind === 'pdf'
      ? 'Lecture directe'
      : book.encrypted
        ? 'Mot de passe requis'
        : `${book.chapters.length} chapitre(s)`;

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

  if (activeBook.encrypted) {
    elements.viewerSubtitle.textContent = 'Fichier .pipi chiffré détecté.';
    elements.bookMeta.classList.add('hidden');
    elements.chapterPanel.classList.add('hidden');
    renderUnlockView(activeBook);
    return;
  }

  elements.viewerSubtitle.textContent = `${activeBook.chapters.length} chapitre(s) détecté(s).`;
  renderMeta(activeBook.meta);
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

function renderMeta(meta) {
  if (!meta) {
    elements.bookMeta.classList.add('hidden');
    return;
  }

  const cover = meta.coverUrl
    ? `<img class="cover-preview" src="${escapeAttribute(meta.coverUrl)}" alt="Couverture" onerror="this.style.display='none'" />`
    : `<div class="cover-preview"></div>`;

  elements.bookMeta.innerHTML = `
    <div class="book-meta-grid">
      <div>${cover}</div>
      <div>
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

    item.innerHTML = `
      <div class="chapter-row">
        <div>
          <h4>${escapeHtml(chapter.title)}</h4>
          <p>${localMatch ? 'PDF local associé trouvé.' : 'Source distante dans le .pipi.'}</p>
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
      remoteBtn.className = 'secondary-btn';
      remoteBtn.type = 'button';
      remoteBtn.textContent = 'Ouvrir URL';
      remoteBtn.addEventListener('click', async () => {
        state.activeChapterId = chapter.id;
        renderChapters(book);
        await renderPdf({
          type: 'url',
          label: `${book.title} — ${chapter.title}`,
          url: chapter.url,
        });
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

function renderUnlockView(book) {
  elements.viewer.className = 'viewer';
  elements.viewer.innerHTML = `
    <div class="unlock-card">
      <h4>${escapeHtml(book.title)}</h4>
      <p>
        Ce .pipi ressemble à un contenu chiffré au format OpenSSL base64 salé.
        Entre le mot de passe si tu le connais.
      </p>
      <div class="unlock-grid">
        <input id="unlockInput" class="text-input" type="password" placeholder="Mot de passe" />
        <button id="unlockBtn" class="primary-btn" type="button">Déverrouiller</button>
      </div>
      <div id="unlockMessage" class="message"></div>
      <p class="small-note">
        Si le mot de passe n'est pas connu, je ne peux pas garantir la lecture de ce fichier côté navigateur.
      </p>
    </div>
  `;

  const input = document.getElementById('unlockInput');
  const button = document.getElementById('unlockBtn');
  const message = document.getElementById('unlockMessage');

  const unlock = () => {
    const password = input.value;
    if (!password) {
      message.className = 'message error';
      message.textContent = 'Entre un mot de passe.';
      return;
    }

    try {
      const decrypted = CryptoJS.AES.decrypt(book.encryptedPayload, password).toString(CryptoJS.enc.Utf8);
      if (!decrypted || !decrypted.includes(DELIMITER)) {
        throw new Error('mot de passe invalide ou format non compatible');
      }

      const parsed = parsePlainPipiText(decrypted.trim(), book.fileName);
      book.encrypted = false;
      book.kind = 'pipi-plain';
      book.meta = parsed.meta;
      book.title = parsed.title;
      book.chapters = parsed.chapters;
      delete book.encryptedPayload;

      message.className = 'message success';
      message.textContent = 'Déverrouillage réussi.';
      renderLibrary();
      renderBookArea();
      setStatus(`Déverrouillage réussi : ${book.title}`);
    } catch (error) {
      message.className = 'message error';
      message.textContent = `Échec : ${error.message}`;
    }
  };

  button.addEventListener('click', unlock);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') unlock();
  });
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
    const loadingTask = await createLoadingTask(source);
    const pdf = await loadingTask.promise;

    if (token !== state.renderToken) return;

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
      ? 'Le lien distant peut être bloqué par CORS ou inaccessible.'
      : 'Le PDF local n’a pas pu être lu.';

    elements.viewer.innerHTML = `
      <div class="unlock-card">
        <h4>Lecture impossible</h4>
        <p>${escapeHtml(detail)}</p>
        <p class="message error">${escapeHtml(error.message || 'Erreur inconnue')}</p>
        ${source.type === 'url' ? `<p><a class="ghost-btn" href="${escapeAttribute(source.url)}" target="_blank" rel="noopener noreferrer">Ouvrir le lien dans un nouvel onglet</a></p>` : ''}
      </div>
    `;

    setStatus(`Échec de lecture : ${error.message}`);
  }
}

async function createLoadingTask(source) {
  if (source.type === 'file') {
    const bytes = await source.file.arrayBuffer();
    return pdfjsLib.getDocument({ data: bytes });
  }

  if (source.type === 'url') {
    return pdfjsLib.getDocument({ url: source.url, withCredentials: false });
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
      <p>Charge un .pipi ou un PDF pour commencer.</p>
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
