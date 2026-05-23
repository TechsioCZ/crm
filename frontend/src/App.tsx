import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type UserRole = "admin" | "sales_rep";

type AuthUser = {
  userId: number;
  email: string;
  role: UserRole;
};

type LoginResponse = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
};

type SalesRep = {
  id: number;
  name: string;
  email: string;
  activeCustomerCount: number;
};

type Assignment = {
  id: number;
  customerId: number;
  salesRepId: number;
  assignedById: number | null;
  startedAt: string;
  endedAt: string | null;
  salesRep: {
    id: number;
    name: string;
    email: string;
  };
  assignedBy: {
    id: number;
    name: string;
    email: string;
  } | null;
};

type Customer = {
  id: number;
  name: string;
  currentAssignment: Assignment | null;
  assignmentHistory: Assignment[];
};

type CustomerListItem = {
  id: number;
  name: string;
  currentAssignment: Assignment | null;
  isMine: boolean;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

function App() {
  const [email, setEmail] = useState("admin@crm.local");
  const [password, setPassword] = useState("Admin123!");

  const [healthStatus, setHealthStatus] = useState("Checking...");
  const [dbStatus, setDbStatus] = useState("Checking...");
  const [authMessage, setAuthMessage] = useState("Not logged in");

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedRepByCustomer, setSelectedRepByCustomer] = useState<Record<number, number>>({});
  const [adminMessage, setAdminMessage] = useState("Admin panel not loaded yet.");
  const [isAdminLoading, setIsAdminLoading] = useState(false);

  const [visibleCustomers, setVisibleCustomers] = useState<CustomerListItem[]>([]);
  const [selectedVisibleCustomerId, setSelectedVisibleCustomerId] = useState<number | null>(null);
  const [manualCustomerId, setManualCustomerId] = useState("2");
  const [customerDetail, setCustomerDetail] = useState<Customer | null>(null);
  const [customerMessage, setCustomerMessage] = useState("Customer panel not loaded yet.");

  const isLoggedIn = useMemo(() => Boolean(token), [token]);
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const [healthRes, dbRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/health`),
          fetch(`${API_BASE_URL}/api/health/db`)
        ]);

        if (healthRes.ok) {
          setHealthStatus("Backend is running");
        } else {
          setHealthStatus("Backend responded with an error");
        }

        if (dbRes.ok) {
          const body = (await dbRes.json()) as { database: string; userCount: number };
          setDbStatus(`Database connected (users: ${body.userCount})`);
        } else {
          setDbStatus("Database endpoint returned an error");
        }
      } catch {
        setHealthStatus("Cannot reach backend");
        setDbStatus("Cannot verify database");
      }
    };

    checkBackend().catch(() => {
      setHealthStatus("Cannot reach backend");
      setDbStatus("Cannot verify database");
    });
  }, []);

  const loadVisibleCustomers = async (accessToken: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/customers`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        setCustomerMessage(`Customer list failed (${response.status}).`);
        return;
      }

      const body = (await response.json()) as { customers: CustomerListItem[] };
      setVisibleCustomers(body.customers);

      if (body.customers.length > 0) {
        const id = body.customers[0].id;
        setSelectedVisibleCustomerId(id);
        await loadCustomerDetail(accessToken, id);
      } else {
        setSelectedVisibleCustomerId(null);
        setCustomerDetail(null);
      }

      setCustomerMessage(`Loaded ${body.customers.length} visible customers.`);
    } catch {
      setCustomerMessage("Failed to load visible customers.");
    }
  };

  const loadCustomerDetail = async (accessToken: string, customerId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/customers/${customerId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        setCustomerDetail(null);
        if (response.status === 403) {
          setCustomerMessage(`Detail blocked for customer ${customerId} (403, expected for foreign customer).`);
          return;
        }

        if (response.status === 404) {
          setCustomerMessage(`Customer ${customerId} not found (404).`);
          return;
        }

        setCustomerMessage(`Customer detail failed (${response.status}).`);
        return;
      }

      const body = (await response.json()) as { customer: Customer };
      setCustomerDetail(body.customer);
      setCustomerMessage(`Detail loaded for ${body.customer.name}.`);
    } catch {
      setCustomerDetail(null);
      setCustomerMessage("Customer detail request failed.");
    }
  };

  const loadAdminData = async (accessToken: string) => {
    setIsAdminLoading(true);

    try {
      const headers = {
        Authorization: `Bearer ${accessToken}`
      };

      const [repRes, customerRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/sales-reps`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/customers`, { headers })
      ]);

      if (!repRes.ok || !customerRes.ok) {
        setAdminMessage("Admin endpoints are not reachable or permission denied.");
        return;
      }

      const repBody = (await repRes.json()) as { salesReps: SalesRep[] };
      const customerBody = (await customerRes.json()) as { customers: Customer[] };

      setSalesReps(repBody.salesReps);
      setCustomers(customerBody.customers);

      const selectedDefaults: Record<number, number> = {};
      for (const customer of customerBody.customers) {
        if (customer.currentAssignment) {
          selectedDefaults[customer.id] = customer.currentAssignment.salesRepId;
        } else if (repBody.salesReps.length > 0) {
          selectedDefaults[customer.id] = repBody.salesReps[0].id;
        }
      }
      setSelectedRepByCustomer(selectedDefaults);

      setAdminMessage("Admin data loaded.");
    } catch {
      setAdminMessage("Failed to load admin data.");
    } finally {
      setIsAdminLoading(false);
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthMessage("Logging in...");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        setToken(null);
        setUser(null);
        setAuthMessage("Login failed. Check credentials.");
        return;
      }

      const body = (await response.json()) as LoginResponse;
      setToken(body.accessToken);
      setUser(body.user);
      setAuthMessage(`Logged in as ${body.user.email} (${body.user.role})`);

      await loadVisibleCustomers(body.accessToken);

      if (body.user.role === "admin") {
        await loadAdminData(body.accessToken);
      }
    } catch {
      setToken(null);
      setUser(null);
      setAuthMessage("Login request failed.");
    }
  };

  const handleMe = async () => {
    if (!token) {
      setAuthMessage("You must login first.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        setAuthMessage("Token rejected by /me endpoint.");
        return;
      }

      const body = (await response.json()) as { user: AuthUser };
      setUser(body.user);
      setAuthMessage(`/me OK -> ${body.user.email} (${body.user.role})`);
    } catch {
      setAuthMessage("/me request failed.");
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setSalesReps([]);
    setCustomers([]);
    setSelectedRepByCustomer({});
    setVisibleCustomers([]);
    setSelectedVisibleCustomerId(null);
    setCustomerDetail(null);
    setAuthMessage("Logged out");
    setAdminMessage("Admin panel not loaded yet.");
    setCustomerMessage("Customer panel not loaded yet.");
  };

  const handleAssign = async (customerId: number) => {
    if (!token) {
      setAdminMessage("Please login first.");
      return;
    }

    const salesRepId = selectedRepByCustomer[customerId];
    if (!salesRepId) {
      setAdminMessage("Please select a sales rep first.");
      return;
    }

    setAdminMessage("Applying assignment change...");

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/customers/${customerId}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ salesRepId })
      });

      if (!response.ok) {
        const message = await response.text();
        setAdminMessage(`Assignment failed: ${message}`);
        return;
      }

      const body = (await response.json()) as { changed: boolean; customer: Customer };
      setCustomers((prev) => prev.map((item) => (item.id === body.customer.id ? body.customer : item)));

      await loadAdminData(token);
      await loadVisibleCustomers(token);

      if (body.changed) {
        setAdminMessage(`Assignment updated for ${body.customer.name}.`);
      } else {
        setAdminMessage(`No change needed for ${body.customer.name} (already assigned).`);
      }
    } catch {
      setAdminMessage("Assignment request failed.");
    }
  };

  const handleLoadSelectedDetail = async () => {
    if (!token || !selectedVisibleCustomerId) {
      setCustomerMessage("No customer selected.");
      return;
    }

    await loadCustomerDetail(token, selectedVisibleCustomerId);
  };

  const handleLoadManualDetail = async () => {
    if (!token) {
      setCustomerMessage("Please login first.");
      return;
    }

    const id = Number(manualCustomerId);
    if (!Number.isInteger(id) || id <= 0) {
      setCustomerMessage("Customer id must be a positive integer.");
      return;
    }

    await loadCustomerDetail(token, id);
  };

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">Phase 3</p>
        <h1>CRM MVP Access + Visibility Check</h1>
        <p className="subtitle">Validate auth, assignment history, and role-based customer visibility.</p>
      </header>

      <section className="status-grid" aria-label="service status">
        <article className="status-card">
          <h2>API</h2>
          <p>{healthStatus}</p>
        </article>
        <article className="status-card">
          <h2>Database</h2>
          <p>{dbStatus}</p>
        </article>
      </section>

      <section className="panel" aria-label="login panel">
        <form className="form" onSubmit={handleLogin}>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button type="submit">Login</button>
        </form>

        <div className="actions">
          <button type="button" onClick={handleMe} disabled={!isLoggedIn}>
            Test /api/auth/me
          </button>
          <button type="button" onClick={handleLogout} disabled={!isLoggedIn}>
            Logout
          </button>
        </div>

        <p className="message">{authMessage}</p>
      </section>

      {isLoggedIn && (
        <section className="panel" aria-label="role visibility panel">
          <div className="admin-head">
            <h2>Role Visibility Panel</h2>
            <button type="button" onClick={() => token && loadVisibleCustomers(token)}>
              Refresh visible customers
            </button>
          </div>

          <p className="message">{customerMessage}</p>

          <p>
            Logged role: <strong>{user?.role}</strong>
          </p>

          <p>
            Visible customers: <strong>{visibleCustomers.length}</strong>
          </p>

          <div className="assign-row">
            <select
              value={selectedVisibleCustomerId ?? ""}
              onChange={(e) => setSelectedVisibleCustomerId(Number(e.target.value))}
            >
              {visibleCustomers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id} - {item.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleLoadSelectedDetail}>
              Load selected detail
            </button>
          </div>

          <div className="assign-row">
            <input
              value={manualCustomerId}
              onChange={(e) => setManualCustomerId(e.target.value)}
              placeholder="Customer ID (try 1 or 2)"
            />
            <button type="button" onClick={handleLoadManualDetail}>
              Load detail by ID
            </button>
          </div>

          {customerDetail && (
            <article className="customer-card">
              <h3>
                Detail: {customerDetail.id} - {customerDetail.name}
              </h3>
              <p>
                Current rep: <strong>{customerDetail.currentAssignment?.salesRep.name ?? "Unassigned"}</strong>
              </p>
              <details>
                <summary>History ({customerDetail.assignmentHistory.length})</summary>
                <ul className="history-list">
                  {customerDetail.assignmentHistory.map((item) => (
                    <li key={item.id}>
                      {item.salesRep.name}: {new Date(item.startedAt).toLocaleString()} -{" "}
                      {item.endedAt ? new Date(item.endedAt).toLocaleString() : "active"}
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          )}
        </section>
      )}

      {isAdmin && (
        <section className="panel admin-panel" aria-label="admin assignments">
          <div className="admin-head">
            <h2>Admin Assignment Panel</h2>
            <button type="button" onClick={() => token && loadAdminData(token)} disabled={isAdminLoading}>
              Refresh
            </button>
          </div>

          <p className="message">{adminMessage}</p>

          <div className="customer-list">
            {customers.map((customer) => {
              const selectedRepId = selectedRepByCustomer[customer.id] ?? 0;

              return (
                <article className="customer-card" key={customer.id}>
                  <h3>{customer.name}</h3>
                  <p>
                    Current rep: <strong>{customer.currentAssignment?.salesRep.name ?? "Unassigned"}</strong>
                  </p>

                  <div className="assign-row">
                    <select
                      value={selectedRepId}
                      onChange={(e) =>
                        setSelectedRepByCustomer((prev) => ({
                          ...prev,
                          [customer.id]: Number(e.target.value)
                        }))
                      }
                    >
                      {salesReps.map((rep) => (
                        <option key={rep.id} value={rep.id}>
                          {rep.name} ({rep.activeCustomerCount} active)
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => handleAssign(customer.id)}>
                      Reassign
                    </button>
                  </div>

                  <details>
                    <summary>Assignment history ({customer.assignmentHistory.length})</summary>
                    <ul className="history-list">
                      {customer.assignmentHistory.map((item) => (
                        <li key={item.id}>
                          {item.salesRep.name}: {new Date(item.startedAt).toLocaleString()} -{" "}
                          {item.endedAt ? new Date(item.endedAt).toLocaleString() : "active"}
                        </li>
                      ))}
                    </ul>
                  </details>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <footer className="footnote">
        API: <code>{API_BASE_URL}</code>
      </footer>
    </main>
  );
}

export default App;
