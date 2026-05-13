(() => {
  const SUPABASE_URL = "https://qtpbrgvtqqpznnwnwrlh.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0cGJyZ3Z0cXFwem5ud253cmxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2ODAzOTAsImV4cCI6MjA5NDI1NjM5MH0.ir8X6LINDbKqWq1E-lu3DxazGNGpAe1gTq0aKve1f4o";
  const TABLE_NAME = "daily_records";
  const LOGIN_PAGE = "login.html";
  const DEFAULT_PAGE = "index.html";
  const APP_PAGES = new Set(["index.html", "qualidade.html"]);

  const currentPage = () => {
    const file = decodeURIComponent(window.location.pathname.split("/").pop() || "");
    return file || DEFAULT_PAGE;
  };

  const redirectTarget = () => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("redirect");
    return APP_PAGES.has(target) ? target : DEFAULT_PAGE;
  };

  const loginUrl = () => {
    const page = currentPage();
    const target = APP_PAGES.has(page) ? page : DEFAULT_PAGE;
    return `${LOGIN_PAGE}?redirect=${encodeURIComponent(target)}`;
  };

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  });

  const readLocalHistory = (storageKey) => {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || {};
    } catch {
      return {};
    }
  };

  const writeLocalHistory = (storageKey, history) => {
    localStorage.setItem(storageKey, JSON.stringify(history));
  };

  const mountLogoutButton = () => {
    const nav = document.querySelector(".dashboard-nav");

    if (!nav || nav.querySelector("[data-logout-button]")) {
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "logout-link";
    button.dataset.logoutButton = "true";
    button.textContent = "Sair";
    button.addEventListener("click", async () => {
      await client.auth.signOut();
      window.location.href = LOGIN_PAGE;
    });

    nav.appendChild(button);
  };

  const injectLogoutStyles = () => {
    if (document.getElementById("supabase-session-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "supabase-session-styles";
    style.textContent = `
      .dashboard-nav .logout-link {
        height: 38px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 0 15px;
        border: 0;
        border-radius: 13px;
        background: transparent;
        color: #d71920;
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        line-height: 1;
        text-transform: uppercase;
        white-space: nowrap;
        transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease;
      }

      .dashboard-nav .logout-link:hover {
        background: rgba(255, 255, 255, 0.72);
        transform: translateY(-1px);
      }

      .dashboard-nav .logout-link:focus-visible {
        outline: 3px solid rgba(215, 25, 32, 0.18);
        outline-offset: 2px;
      }
    `;
    document.head.appendChild(style);
  };

  const getSession = async () => {
    const { data, error } = await client.auth.getSession();

    if (error) {
      throw error;
    }

    return data.session;
  };

  const requireAuth = async () => {
    const session = await getSession();

    if (!session) {
      window.location.href = loginUrl();
      return null;
    }

    injectLogoutStyles();
    mountLogoutButton();
    return session;
  };

  const redirectIfAuthenticated = async () => {
    const session = await getSession();

    if (session) {
      window.location.href = redirectTarget();
      return session;
    }

    return null;
  };

  const loadRemoteHistory = async (dashboard) => {
    const { data, error } = await client
      .from(TABLE_NAME)
      .select("record_date,data")
      .eq("dashboard", dashboard)
      .order("record_date", { ascending: true });

    if (error) {
      throw error;
    }

    return (data || []).reduce((history, row) => {
      history[row.record_date] = row.data;
      return history;
    }, {});
  };

  const currentUserId = async () => {
    const { data, error } = await client.auth.getUser();

    if (error) {
      throw error;
    }

    return data.user?.id || null;
  };

  const saveDashboardRecord = async (dashboard, recordDate, state) => {
    const userId = await currentUserId();
    const { error } = await client
      .from(TABLE_NAME)
      .upsert(
        {
          dashboard,
          record_date: recordDate,
          data: state,
          updated_by: userId,
          updated_at: new Date().toISOString()
        },
        { onConflict: "dashboard,record_date" }
      );

    if (error) {
      throw error;
    }
  };

  const loadDashboardHistory = async (dashboard, storageKey, normalizeState) => {
    const remoteHistory = await loadRemoteHistory(dashboard);
    const localHistory = readLocalHistory(storageKey);
    const missingLocalDates = Object.keys(localHistory)
      .filter((date) => !remoteHistory[date])
      .sort();

    for (const date of missingLocalDates) {
      const state = normalizeState(localHistory[date]);
      await saveDashboardRecord(dashboard, date, state);
      remoteHistory[date] = state;
    }

    if (missingLocalDates.length) {
      writeLocalHistory(storageKey, remoteHistory);
    }

    return remoteHistory;
  };

  window.NHPDashboard = {
    client,
    redirectTarget,
    redirectIfAuthenticated,
    requireAuth,
    readLocalHistory,
    writeLocalHistory,
    loadDashboardHistory,
    saveDashboardRecord
  };
})();
