/* BookNest Workspace upgrade (add-on). Adds a "Workspace" section to your EXISTING booknest.html.
   Keeps all your current pages/design. Loads React 18 + htm from a CDN, so open it with Live Server / internet on. */
(function () {
  const LIBS = [
    'https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js',
    'https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js',
    'https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js',
  ];
  const load = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Failed to load ' + src)); document.head.appendChild(s); });
  LIBS.reduce((p, s) => p.then(() => load(s)), Promise.resolve()).then(init).catch((e) => console.error('BookNest upgrade:', e));

  function init() {
    const { createElement: h, useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } = React;
    const html = htm.bind((t, p, ...c) => h(t, p && p.class ? { ...p, className: p.class, class: undefined } : p, ...c));
    const Ctx = createContext(null);
    const useApp = () => useContext(Ctx);
    const go = (p) => { location.hash = '#' + p; };

    /* ---------- styles that extend your existing design system ---------- */
    const st = document.createElement('style');
    st.textContent = `.ws-nav{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:28px;align-items:center}
.ws-err{color:#E15A5A;font-size:12px}.ws-sub{color:#9C97AE;font-size:14px}.ws-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-bottom:28px}
.ws-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}.ws-field label{font-size:12px;color:#9C97AE}
.ws-field input,.ws-field textarea,.ws-field select{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);border-radius:10px;padding:9px 12px;font-size:14px;color:inherit;outline:none}
.ws-field input[aria-invalid=true],.ws-field textarea[aria-invalid=true]{border-color:#E15A5A}
.ws-menu{position:absolute;right:0;top:44px;min-width:180px;background:var(--ink-soft);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:6px;z-index:60}
.ws-menu button{display:block;width:100%;text-align:left;background:none;border:none;color:inherit;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:13px}
.ws-menu button:hover,.ws-menu button.on{background:rgba(201,162,39,.12);color:#E4C55E}
.ws-acc-body{overflow:hidden;transition:max-height .25s ease}`;
    document.head.appendChild(st);

    /* ---------- custom hooks ---------- */
    const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
    function useLocalStorage(k, d) { const [v, setV] = useState(() => store.get(k, d)); useEffect(() => store.set(k, v), [k, v]); return [v, setV]; }
    function useDebounce(v, ms = 400) { const [x, setX] = useState(v); useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t); }, [v, ms]); return x; }
    function useHashRoute() {
      const [r, setR] = useState(location.hash.slice(1) || '/dashboard');
      useEffect(() => { const f = () => setR(location.hash.slice(1) || '/dashboard'); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
      return r;
    }
    function useFetch(url) { // loading / success / error, cancellation, retry
      const [s, setS] = useState({ status: url ? 'loading' : 'idle', data: null, error: '' });
      const [n, setN] = useState(0);
      useEffect(() => {
        if (!url) { setS({ status: 'idle', data: null, error: '' }); return; }
        const c = new AbortController();
        setS((p) => ({ ...p, status: 'loading', error: '' }));
        fetch(url, { signal: c.signal }).then((r) => { if (!r.ok) throw Error('Request failed (' + r.status + ')'); return r.json(); })
          .then((data) => setS({ status: 'success', data, error: '' }))
          .catch((e) => { if (e.name !== 'AbortError') setS({ status: 'error', data: null, error: e.message || 'Network error' }); });
        return () => c.abort();
      }, [url, n]);
      return { ...s, retry: () => setN((x) => x + 1) };
    }

    /* ---------- global state via Context API ---------- */
    function Provider({ children }) {
      const [toasts, setToasts] = useState([]);
      const toast = useCallback((m) => { const id = Math.random(); setToasts((t) => [...t, { id, m }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600); }, []);
      const [notes, setNotes] = useLocalStorage('bn_ws_notes', []);
      const [session, setSession] = useLocalStorage('bn_ws_session', null);
      const value = useMemo(() => ({ toast, notes, setNotes, session, setSession }), [toast, notes, session]);
      return html`<${Ctx.Provider} value=${value}>${children}
        <div class="toast-wrap" aria-live="polite">${toasts.map((t) => html`<div key=${t.id} class="toast" role="status">${t.m}</div>`)}</div><//>`;
    }

    /* ---------- reusable UI ---------- */
    const Empty = ({ title, body, children }) => html`<div class="empty"><h3 class="serif">${title}</h3><p>${body}</p>${children}</div>`;
    const ErrorBox = ({ message, onRetry }) => html`<div class="empty"><h3 class="serif">Something went wrong</h3><p>${message}</p><button class="btn btn-gold" onClick=${onRetry}>Try again</button></div>`;
    const Skeletons = ({ n = 6 }) => html`<div class="grid-books">${Array.from({ length: n }, (_, i) => html`<div key=${i} class="skeleton-card"><div class="skeleton"></div><div class="skeleton skeleton-line" style=${{ width: '70%' }}></div></div>`)}</div>`;
    function Modal({ title, onClose, children }) {
      useEffect(() => { const f = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, [onClose]);
      return html`<div class="overlay" onClick=${(e) => e.target === e.currentTarget && onClose()}><div class="modal" role="dialog" aria-modal="true" aria-label=${title}>
        <button class="modal-close" onClick=${onClose} aria-label="Close">✕</button><h2 class="serif" style=${{ marginTop: 0 }}>${title}</h2>${children}</div></div>`;
    }
    const Confirm = ({ title, message, label = 'Delete', onYes, onNo }) => html`<${Modal} title=${title} onClose=${onNo}><p class="ws-sub">${message}</p>
      <div class="row gap-2"><button class="btn btn-ghost" onClick=${onNo}>Cancel</button><button class="btn btn-gold" onClick=${onYes}>${label}</button></div><//>`;
    const Tabs = ({ tabs, value, onChange }) => html`<div class="ws-nav" role="tablist">${tabs.map(([id, l]) => html`<button key=${id} role="tab" aria-selected=${value === id} class=${'chip ' + (value === id ? 'active' : '')} onClick=${() => onChange(id)}>${l}</button>`)}</div>`;
    function Dropdown({ label, options, value, onChange }) {
      const [open, setOpen] = useState(false); const ref = useRef(null);
      useEffect(() => { const f = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false); addEventListener('click', f); return () => removeEventListener('click', f); }, []);
      return html`<div ref=${ref} style=${{ position: 'relative' }}><button class="btn btn-ghost btn-sm" aria-haspopup="menu" aria-expanded=${open} onClick=${() => setOpen(!open)}>${label}: ${value} ▾</button>
        ${open && html`<div class="ws-menu" role="menu">${options.map((o) => html`<button key=${o} role="menuitem" class=${o === value ? 'on' : ''} onClick=${() => { onChange(o); setOpen(false); }}>${o}</button>`)}</div>`}</div>`;
    }
    const Pager = ({ page, pages, onChange }) => pages > 1 && html`<div class="row center gap-3" style=${{ marginTop: 28 }}>
      <button class="btn btn-ghost btn-sm" disabled=${page <= 1} onClick=${() => onChange(page - 1)}>← Prev</button><span style=${{ fontSize: 13 }}>Page ${page} of ${pages}</span>
      <button class="btn btn-ghost btn-sm" disabled=${page >= pages} onClick=${() => onChange(page + 1)}>Next →</button></div>`;
    function Field({ label, error, as = 'input', ...p }) {
      const id = useRef('f' + Math.random().toString(36).slice(2)).current;
      return html`<div class="ws-field"><label htmlFor=${id}>${label}</label>${h(as, { id, 'aria-invalid': !!error, 'aria-describedby': error ? id + 'e' : undefined, ...p })}${error && html`<span id=${id + 'e'} class="ws-err" role="alert">${error}</span>`}</div>`;
    }
    const Expand = ({ title, children }) => { const [o, setO] = useState(false); return html`<div class="accordion-item"><button class="accordion-head" aria-expanded=${o} onClick=${() => setO(!o)}><span>${title}</span><span>${o ? '−' : '+'}</span></button>${o && html`<div class="accordion-body">${children}</div>`}</div>`; };

    /* ---------- pages ---------- */
    const BookCardMini = ({ b }) => html`<div class="book-card"><a class="book-cover-wrap" href=${'#/book/' + b.id} aria-label=${'Open ' + b.title}><img src=${b.cover} alt=${'Cover of ' + b.title} loading="lazy"/></a>
      <a href=${'#/book/' + b.id} class="book-meta"><p class="book-title serif">${b.title}</p><p class="book-author">${b.author}</p></a></div>`;

    function Dashboard() {
      const { notes, session } = useApp();
      const lib = State.library;
      const reading = Object.entries(lib.reading).map(([id, p]) => ({ b: bookById(id), p })).filter((x) => x.b).sort((a, b) => b.p.updatedAt - a.p.updatedAt);
      return html`<div>
        <h1 class="serif" style=${{ fontSize: 30, margin: '0 0 6px' }}>Workspace dashboard</h1>
        <p class="ws-sub">${session ? 'Signed in (demo) as ' + session.name : 'Browsing as a guest.'} Everything here is stored in your browser.</p>
        <div class="ws-grid">
          ${[['Saved books', Object.keys(lib.saved).length], ['Wishlist', Object.keys(lib.wishlist).length], ['In progress', reading.filter((x) => x.p.percent < 100).length], ['My notes', notes.length]]
            .map(([l, v]) => html`<div key=${l} class="stat-card"><div class="lbl">${l}</div><p class="val serif">${v}</p></div>`)}
        </div>
        <h3 class="serif">Continue reading</h3>
        ${reading.length ? reading.slice(0, 3).map(({ b, p }) => html`<button key=${b.id} class="lib-row" onClick=${() => openReader(b.id)}><img src=${b.cover} alt=""/><div style=${{ flex: 1 }}><p style=${{ margin: '0 0 6px' }}>${b.title}</p>
          <div class="progress-track"><div class="progress-bar" style=${{ width: p.percent + '%' }}></div></div></div><span>${p.percent}%</span></button>`)
          : html`<${Empty} title="Nothing in progress" body="Open any book in the reader and it shows up here."><a class="btn btn-gold" href="#/discover">Find a book</a><//>`}
      </div>`;
    }

    function LocalCatalog() {
      const [text, setText] = useState(''); const q = useDebounce(text, 300);
      const [genre, setGenre] = useState('All'); const [sort, setSort] = useState('Most Popular'); const [page, setPage] = useState(1);
      const sorts = { 'Most Popular': (a, b) => b.reviews - a.reviews, 'Highest Rated': (a, b) => b.rating - a.rating, 'A–Z': (a, b) => a.title.localeCompare(b.title), 'Z–A': (a, b) => b.title.localeCompare(a.title) };
      const list = useMemo(() => BOOKS.filter((b) => (genre === 'All' || b.genre === genre) && [b.title, b.author, b.genre].some((f) => f.toLowerCase().includes(q.trim().toLowerCase()))).sort(sorts[sort]), [q, genre, sort]);
      useEffect(() => setPage(1), [q, genre, sort]);
      const pages = Math.max(1, Math.ceil(list.length / 10)); const shown = list.slice((page - 1) * 10, page * 10);
      const dirty = text || genre !== 'All' || sort !== 'Most Popular';
      return html`<div>
        <div class="row gap-3" style=${{ flexWrap: 'wrap', marginBottom: 16 }}>
          <label class="search-field" style=${{ minWidth: 220 }}><input aria-label="Search" placeholder="Search title, author, genre…" value=${text} onInput=${(e) => setText(e.target.value)}/></label>
          <${Dropdown} label="Genre" options=${['All', ...GENRES]} value=${genre} onChange=${setGenre}/>
          <${Dropdown} label="Sort" options=${Object.keys(sorts)} value=${sort} onChange=${setSort}/>
          ${dirty && html`<button class="btn btn-ghost btn-sm" onClick=${() => { setText(''); setGenre('All'); setSort('Most Popular'); }}>Clear filters</button>`}
        </div>
        <p class="ws-sub">${list.length} ${list.length === 1 ? 'book' : 'books'}</p>
        ${shown.length ? html`<div class="grid-books">${shown.map((b) => html`<${BookCardMini} key=${b.id} b=${b}/>`)}</div>`
          : html`<${Empty} title="No matches" body="Try different words or clear filters."/>`}
        <${Pager} page=${page} pages=${pages} onChange=${setPage}/></div>`;
    }

    function LiveSearch() { // real third-party API: Open Library
      const [text, setText] = useState(''); const q = useDebounce(text, 450);
      const [page, setPage] = useState(1); const [docs, setDocs] = useState([]);
      useEffect(() => { setPage(1); setDocs([]); }, [q]);
      const url = q.trim() ? `https://openlibrary.org/search.json?q=${encodeURIComponent(q.trim())}&page=${page}&limit=12&fields=key,title,author_name,cover_i,first_publish_year` : null;
      const { status, data, error, retry } = useFetch(url);
      useEffect(() => { if (data?.docs) setDocs((d) => (page === 1 ? data.docs : [...d, ...data.docs])); }, [data]);
      const more = docs.length < (data?.numFound || 0);
      const sentinel = useRef(null);
      useEffect(() => { // infinite scroll
        const el = sentinel.current; if (!el) return;
        const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && status === 'success' && more) setPage((p) => p + 1); }, { rootMargin: '200px' });
        io.observe(el); return () => io.disconnect();
      }, [status, more, docs.length]);
      return html`<div>
        <label class="search-field" style=${{ marginBottom: 20 }}><input aria-label="Search Open Library" placeholder="Search millions of books (e.g. dune, austen)…" value=${text} onInput=${(e) => setText(e.target.value)}/></label>
        ${!q.trim() && html`<${Empty} title="Live search" body="Results come from openlibrary.org as you type (debounced)."/>`}
        ${status === 'error' && html`<${ErrorBox} message=${error} onRetry=${retry}/>`}
        ${status === 'loading' && page === 1 && html`<${Skeletons} n=${6}/>`}
        ${q.trim() && status === 'success' && !docs.length && html`<${Empty} title="No matches" body=${'Nothing found for “' + q + '”.'}/>`}
        ${docs.length > 0 && html`<div class="grid-books">${docs.map((d) => html`<div key=${d.key} class="book-card"><div class="book-cover-wrap">${d.cover_i ? html`<img src=${'https://covers.openlibrary.org/b/id/' + d.cover_i + '-M.jpg'} alt=${'Cover of ' + d.title} loading="lazy"/>` : html`<div class="skeleton" style=${{ aspectRatio: '2/3' }}></div>`}</div>
          <p class="book-title serif">${d.title}</p><p class="book-author">${(d.author_name || ['Unknown'])[0]}${d.first_publish_year ? ' · ' + d.first_publish_year : ''}</p></div>`)}</div>
          <div ref=${sentinel} style=${{ height: 1 }}></div>`}
        ${docs.length > 0 && more && html`<div class="row center" style=${{ marginTop: 20 }}><button class="btn btn-gold" disabled=${status === 'loading'} onClick=${() => setPage((p) => p + 1)}>${status === 'loading' ? 'Loading…' : 'Load more'}</button></div>`}</div>`;
    }

    function Discover({ query }) {
      const tab = query.get('tab') || 'catalog';
      return html`<div><h1 class="serif" style=${{ fontSize: 30, margin: '0 0 16px' }}>Discover</h1>
        <${Tabs} tabs=${[['catalog', 'BookNest catalog'], ['live', 'Open Library (live API)']]} value=${tab} onChange=${(t) => go('/discover?tab=' + t)}/>
        ${tab === 'live' ? html`<${LiveSearch}/>` : html`<${LocalCatalog}/>`}</div>`;
    }

    function BookPage({ params }) { // dynamic route
      const b = bookById(params.id);
      if (!b) return html`<${Empty} title="Book not found" body=${'No book with id “' + params.id + '”.'}><a class="btn btn-gold" href="#/discover">Back</a><//>`;
      return html`<div class="details-grid"><div><img class="details-cover" src=${b.cover} alt=${'Cover of ' + b.title}/></div><div>
        <span class="eyebrow">${b.genre}</span><h1 class="serif">${b.title}</h1><p class="ws-sub">by ${b.author} · ★ ${b.rating} · ${b.readingMinutes} min</p><p style=${{ lineHeight: 1.7 }}>${b.description}</p>
        <${Expand} title="Chapters (${b.chapters.length})">${b.chapters.map((c, i) => html`<div key=${c.id}>${i + 1}. ${c.title}</div>`)}<//>
        <div class="row gap-2" style=${{ marginTop: 16 }}><button class="btn btn-gold" onClick=${() => openReader(b.id)}>Read now</button><button class="btn btn-ghost" onClick=${() => openBook(b.id)}>Full details page</button></div></div></div>`;
    }

    function Notes() { // CRUD + search/filter/sort + persistence + confirmation
      const { notes, setNotes, toast } = useApp();
      const [q, setQ] = useState(''); const [cat, setCat] = useState('All'); const [order, setOrder] = useState('Newest');
      const [edit, setEdit] = useState(null); const [del, setDel] = useState(null); const [err, setErr] = useState({}); const [busy, setBusy] = useState(false);
      const shown = useMemo(() => notes.filter((n) => (cat === 'All' || n.cat === cat) && (n.title + n.body).toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => (order === 'Newest' ? b.at - a.at : a.at - b.at)), [notes, q, cat, order]);
      const save = (e) => {
        e.preventDefault(); if (busy) return;
        const f = new FormData(e.target), title = f.get('title').trim(), body = f.get('body').trim(), c = f.get('cat');
        const er = {}; if (!title) er.title = 'Title is required.'; if (body.length < 3) er.body = 'Write at least 3 characters.';
        setErr(er); if (Object.keys(er).length) return;
        setBusy(true);
        setNotes(edit.id ? notes.map((n) => (n.id === edit.id ? { ...n, title, body, cat: c, at: Date.now() } : n)) : [{ id: Date.now() + '', title, body, cat: c, at: Date.now() }, ...notes]);
        toast(edit.id ? 'Note updated.' : 'Note created.'); setBusy(false); setEdit(null);
      };
      return html`<div>
        <div class="row between"><h1 class="serif" style=${{ fontSize: 30, margin: 0 }}>Reading notes</h1><button class="btn btn-gold" onClick=${() => { setErr({}); setEdit({}); }}>New note</button></div>
        <div class="row gap-3" style=${{ margin: '16px 0 24px', flexWrap: 'wrap' }}>
          <label class="search-field"><input aria-label="Search notes" placeholder="Search notes…" value=${q} onInput=${(e) => setQ(e.target.value)}/></label>
          <${Dropdown} label="Type" options=${['All', 'Quote', 'Idea', 'To-read']} value=${cat} onChange=${setCat}/>
          <${Dropdown} label="Sort" options=${['Newest', 'Oldest']} value=${order} onChange=${setOrder}/></div>
        ${shown.length ? shown.map((n) => html`<div key=${n.id} class="feature-card" style=${{ marginBottom: 12 }}><span class="chip active" style=${{ cursor: 'default' }}>${n.cat}</span><h3 class="serif">${n.title}</h3><p style=${{ whiteSpace: 'pre-wrap' }}>${n.body}</p>
          <div class="row gap-2"><button class="btn btn-ghost btn-sm" onClick=${() => { setErr({}); setEdit(n); }}>Edit</button><button class="btn btn-ghost btn-sm" onClick=${() => setDel(n.id)}>Delete</button></div></div>`)
          : html`<${Empty} title=${notes.length ? 'No matching notes' : 'No notes yet'} body=${notes.length ? 'Change your search or filter.' : 'Capture quotes and ideas as you read.'}/>`}
        ${edit && html`<${Modal} title=${edit.id ? 'Edit note' : 'New note'} onClose=${() => setEdit(null)}><form onSubmit=${save} noValidate>
          <${Field} label="Title" name="title" defaultValue=${edit.title} error=${err.title}/>
          <${Field} label="Type" as="select" name="cat" defaultValue=${edit.cat || 'Idea'}><option>Quote</option><option>Idea</option><option>To-read</option><//>
          <${Field} label="Note" as="textarea" rows="5" name="body" defaultValue=${edit.body} error=${err.body}/>
          <button class="btn btn-gold btn-block" disabled=${busy}>${busy ? 'Saving…' : 'Save note'}</button></form><//>`}
        ${del && html`<${Confirm} title="Delete note?" message="This can't be undone." onNo=${() => setDel(null)} onYes=${() => { setNotes(notes.filter((n) => n.id !== del)); setDel(null); toast('Note deleted.'); }}/>`}</div>`;
    }

    const rules = {
      name: (v) => (!v.trim() ? 'Name is required.' : v.trim().length < 2 ? 'Name is too short.' : ''),
      email: (v) => (!v.trim() ? 'Email is required.' : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? 'Enter a valid email address.' : ''),
      password: (v) => (v.length < 8 ? 'Use at least 8 characters.' : !/\d/.test(v) ? 'Include at least one number.' : ''),
      confirm: (v, a) => (v !== a.password ? 'Passwords do not match.' : ''),
      terms: (v) => (v ? '' : 'Please accept the terms.'),
    };
    function Register() { // controlled form + validation
      const { setSession, toast } = useApp();
      const [v, setV] = useState({ name: '', email: '', password: '', confirm: '', terms: false });
      const [touched, setTouched] = useState({}); const [busy, setBusy] = useState(false);
      const errors = useMemo(() => Object.fromEntries(Object.keys(rules).map((k) => [k, rules[k](v[k], v)]).filter(([, m]) => m)), [v]);
      const on = (k) => ({ name: k, value: v[k], onInput: (e) => setV({ ...v, [k]: e.target.value }), onBlur: () => setTouched({ ...touched, [k]: true }), error: touched[k] && errors[k] });
      const submit = (e) => {
        e.preventDefault(); if (busy) return;
        setTouched({ name: 1, email: 1, password: 1, confirm: 1, terms: 1 }); if (Object.keys(errors).length) return;
        setBusy(true); // Demo only: no backend, so the password is never stored or sent anywhere.
        setTimeout(() => { setSession({ name: v.name.trim(), email: v.email.trim() }); toast('Demo account created in this browser.'); setBusy(false); go('/account'); }, 600);
      };
      return html`<div style=${{ maxWidth: 440 }}><h1 class="serif">Create a demo account</h1><p class="ws-sub">No server is connected: nothing is verified, stored remotely, or sent anywhere.</p>
        <form onSubmit=${submit} noValidate>
          <${Field} label="Full name" autoComplete="name" ...${on('name')}/><${Field} label="Email" type="email" autoComplete="email" ...${on('email')}/>
          <${Field} label="Password" type="password" autoComplete="new-password" ...${on('password')}/><${Field} label="Confirm password" type="password" ...${on('confirm')}/>
          <label class="check-row" style=${{ marginBottom: 6 }}><input type="checkbox" checked=${v.terms} onChange=${(e) => setV({ ...v, terms: e.target.checked })} onBlur=${() => setTouched({ ...touched, terms: true })}/> I accept the terms</label>
          ${touched.terms && errors.terms && html`<p class="ws-err" role="alert">${errors.terms}</p>`}
          <button class="btn btn-gold btn-block" style=${{ marginTop: 12 }} disabled=${busy}>${busy ? 'Creating…' : 'Create account'}</button></form></div>`;
    }
    function Account() {
      const { session, setSession, toast } = useApp(); const [ask, setAsk] = useState(false);
      return html`<div><h1 class="serif">Account</h1><div class="feature-card"><h3 class="serif">${session.name}</h3><p class="ws-sub">${session.email}</p>
        <p class="ws-sub">Demo session only. This route is a UI gate, not real security.</p><button class="btn btn-ghost" onClick=${() => setAsk(true)}>Log out</button></div>
        ${ask && html`<${Confirm} title="Log out?" message="Your notes stay saved in this browser." label="Log out" onNo=${() => setAsk(false)} onYes=${() => { setSession(null); setAsk(false); toast('Logged out.'); go('/dashboard'); }}/>`}</div>`;
    }
    const NotFound = () => html`<${Empty} title="404 — page not found" body="That workspace page doesn't exist."><a class="btn btn-gold" href="#/dashboard">Back to dashboard</a><//>`;

    /* ---------- routing: params, query strings, protected + 404 ---------- */
    const match = (pat, path) => { const a = pat.split('/'), b = path.split('/'); if (a.length !== b.length) return null; const p = {}; for (let i = 0; i < a.length; i++) { if (a[i][0] === ':') p[a[i].slice(1)] = decodeURIComponent(b[i]); else if (a[i] !== b[i]) return null; } return p; };
    const ROUTES = [['/dashboard', Dashboard], ['/discover', Discover], ['/notes', Notes], ['/book/:id', BookPage], ['/register', Register], ['/account', Account, true]];
    function Redirect({ to }) { useEffect(() => go(to), [to]); return null; }
    function Shell() {
      const raw = useHashRoute(); const [path, qs] = raw.split('?'); const query = new URLSearchParams(qs || ''); const { session } = useApp();
      let view = html`<${NotFound}/>`;
      for (const [pat, C, protectedRoute] of ROUTES) { const p = match(pat, path); if (p) { view = protectedRoute && !session ? html`<${Redirect} to="/register"/>` : html`<${C} params=${p} query=${query}/>`; break; } }
      const links = [['/dashboard', 'Dashboard'], ['/discover', 'Discover'], ['/notes', 'Notes'], [session ? '/account' : '/register', session ? 'Account' : 'Register']];
      return html`<div class="wrap" style=${{ padding: '32px 20px 48px' }}><nav class="ws-nav" aria-label="Workspace">${links.map(([to, l]) => html`<a key=${to} href=${'#' + to} class=${'navlink ' + (path === to || path.startsWith(to + '/') || (to === '/discover' && path.startsWith('/book/')) ? 'active' : '')}>${l}</a>`)}</nav>${view}</div>`;
    }

    /* ---------- hook into the existing vanilla app without rewriting it ---------- */
    let root = null, mountedEl = null;
    const baseRender = window.render;
    window.render = function () {
      baseRender();
      const nl = document.querySelector('.navlinks');
      if (nl && !nl.querySelector('[data-ws]')) {
        const b = document.createElement('button'); b.className = 'navlink' + (State.view === 'workspace' ? ' active' : ''); b.dataset.ws = 1; b.textContent = 'Workspace'; b.onclick = () => goView('workspace');
        nl.insertBefore(b, nl.querySelector('.dropdown'));
      }
      const mob = document.querySelector('.navmobile');
      if (mob) { const b = document.createElement('button'); b.className = 'navlink'; b.textContent = 'Workspace'; b.onclick = () => goView('workspace'); mob.insertBefore(b, mob.firstChild); }
      if (State.view !== 'workspace') { if (root) { root.unmount(); root = null; mountedEl = null; } return; }
      const hdr = document.querySelector('header.navbar'); const slot = hdr && hdr.nextElementSibling; if (!slot) return;
      if (slot !== mountedEl) { // the vanilla app re-created the DOM: remount (data persists in localStorage)
        if (root) root.unmount();
        slot.removeAttribute('style'); slot.className = ''; slot.innerHTML = ''; mountedEl = slot;
        root = ReactDOM.createRoot(slot); root.render(html`<${Provider}><${Shell}/><//>`);
      }
    };
    window.render();
  }
})();