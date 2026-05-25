import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type UserRole = "admin" | "sales_rep";
type WorkspaceTab = "contact_list" | "product_list" | "order_list" | "categories" | "dashboard";

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

type SalesRepOption = {
  id: number;
  name: string;
  email: string;
};

type ContactRow = {
  id: number;
  name: string;
  currentSalesRep: SalesRepOption | null;
  ordersCount: number;
  notesCount: number;
  tasksCount: number;
  createdAt: string;
};

type ProductRow = {
  id: number;
  sku: string | null;
  name: string;
  categoryName: string | null;
  isActive: boolean;
  turnoverNetCzk: string;
  orderItemLines: number;
  createdAt: string;
};

type OrderRow = {
  id: number;
  orderId: string;
  status: string;
  importedAt: string;
  customer: {
    id: number;
    name: string;
  };
  currentSalesRep: SalesRepOption | null;
  totals: {
    lineCount: number;
    productNetCzk: string;
    shippingNetCzk: string;
    paymentNetCzk: string;
    otherNetCzk: string;
    allNetCzk: string;
  };
};

type CategoryRow = {
  id: number;
  name: string;
  turnoverNetCzk: string;
  topProductsTotal: number;
  topProductsActive: number;
};

type TopProductRow = {
  id: number;
  name: string;
  sku: string | null;
  categoryName: string | null;
  isActive: boolean;
  turnoverNetCzk: string;
};

type DashboardResponse = {
  totals: {
    productTurnoverNetCzk: string;
    productLineCount: number;
    activeTopProductsCount: number;
  };
  categoryShareTotal: Array<{
    category: string;
    turnoverNetCzk: string;
    sharePct: string;
  }>;
  categoryShareBySalesRep: Array<{
    salesRepId: number;
    salesRepName: string;
    totalTurnoverNetCzk: string;
    categories: Array<{
      category: string;
      turnoverNetCzk: string;
      sharePct: string;
    }>;
  }>;
  topProductSalesTotal: Array<{
    topProductId: number;
    topProductName: string;
    turnoverNetCzk: string;
    sharePct: string;
  }>;
  topProductSalesBySalesRep: Array<{
    salesRepId: number;
    salesRepName: string;
    totalTopProductTurnoverNetCzk: string;
    products: Array<{
      topProductId: number;
      topProductName: string;
      turnoverNetCzk: string;
      sharePct: string;
    }>;
  }>;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

function App() {
  const [email, setEmail] = useState("admin@crm.local");
  const [password, setPassword] = useState("Admin123!");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authMessage, setAuthMessage] = useState("Not logged in.");
  const [healthStatus, setHealthStatus] = useState("Checking...");
  const [dbStatus, setDbStatus] = useState("Checking...");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("contact_list");

  const [salesReps, setSalesReps] = useState<SalesRepOption[]>([]);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [contactNameFilter, setContactNameFilter] = useState("");
  const [contactSalesRepFilter, setContactSalesRepFilter] = useState("");
  const [contactHasOrdersFilter, setContactHasOrdersFilter] = useState<"any" | "yes" | "no">("any");
  const [contactMessage, setContactMessage] = useState("Contact list not loaded yet.");
  const [contactsLoading, setContactsLoading] = useState(false);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productNameFilter, setProductNameFilter] = useState("");
  const [productSkuFilter, setProductSkuFilter] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [productActiveFilter, setProductActiveFilter] = useState<"any" | "true" | "false">("any");
  const [productMessage, setProductMessage] = useState("Product list not loaded yet.");
  const [productsLoading, setProductsLoading] = useState(false);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [orderIdFilter, setOrderIdFilter] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("");
  const [orderCustomerFilter, setOrderCustomerFilter] = useState("");
  const [orderSalesRepFilter, setOrderSalesRepFilter] = useState("");
  const [orderDateFromFilter, setOrderDateFromFilter] = useState("");
  const [orderDateToFilter, setOrderDateToFilter] = useState("");
  const [orderMessage, setOrderMessage] = useState("Order list not loaded yet.");
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoriesMessage, setCategoriesMessage] = useState("Categories not loaded yet.");
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  const [topProducts, setTopProducts] = useState<TopProductRow[]>([]);
  const [topProductFilterQ, setTopProductFilterQ] = useState("");
  const [topProductFilterCategory, setTopProductFilterCategory] = useState("");
  const [topProductFilterActive, setTopProductFilterActive] = useState<"any" | "true" | "false">("any");
  const [newTopProductName, setNewTopProductName] = useState("");
  const [newTopProductSku, setNewTopProductSku] = useState("");
  const [newTopProductCategory, setNewTopProductCategory] = useState("");
  const [newTopProductActive, setNewTopProductActive] = useState(true);
  const [topProductsMessage, setTopProductsMessage] = useState("Top products not loaded yet.");
  const [topProductsLoading, setTopProductsLoading] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [dashboardMessage, setDashboardMessage] = useState("Dashboard not loaded yet.");
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const isLoggedIn = useMemo(() => Boolean(token), [token]);
  const isAdmin = user?.role === "admin";

  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: "contact_list", label: "contact list" },
    { id: "product_list", label: "product list" },
    { id: "order_list", label: "order list" },
    { id: "categories", label: "categories" },
    { id: "dashboard", label: "dashboard" }
  ];

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const [healthRes, dbRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/health`),
          fetch(`${API_BASE_URL}/api/health/db`)
        ]);

        setHealthStatus(healthRes.ok ? "Backend is running" : "Backend health endpoint error");
        if (dbRes.ok) {
          const body = (await dbRes.json()) as { userCount: number };
          setDbStatus(`Database connected (users: ${body.userCount})`);
        } else {
          setDbStatus("Database endpoint error");
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

  const loadMeta = async (accessToken: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/workspace/meta`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) {
        return;
      }
      const body = (await response.json()) as {
        salesReps: SalesRepOption[];
        categories: Array<{ id: number; name: string }>;
      };
      setSalesReps(body.salesReps);
      setCategoryNames(body.categories.map((item) => item.name));
    } catch {
      // silent
    }
  };

  const loadContacts = async (accessToken: string) => {
    setContactsLoading(true);
    try {
      const query = new URLSearchParams();
      if (contactNameFilter.trim()) {
        query.set("name", contactNameFilter.trim());
      }
      if (contactSalesRepFilter) {
        query.set("salesRepId", contactSalesRepFilter);
      }
      query.set("hasOrders", contactHasOrdersFilter);
      query.set("limit", "500");

      const response = await fetch(`${API_BASE_URL}/api/workspace/contacts?${query.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        setContactMessage(`Contact list failed (${response.status}).`);
        setContacts([]);
        return;
      }

      const body = (await response.json()) as { contacts: ContactRow[]; summary: { count: number } };
      setContacts(body.contacts);
      setContactMessage(`Loaded ${body.summary.count} contacts.`);
    } catch {
      setContacts([]);
      setContactMessage("Contact list request failed.");
    } finally {
      setContactsLoading(false);
    }
  };

  const loadProducts = async (accessToken: string) => {
    setProductsLoading(true);
    try {
      const query = new URLSearchParams();
      if (productNameFilter.trim()) {
        query.set("name", productNameFilter.trim());
      }
      if (productSkuFilter.trim()) {
        query.set("sku", productSkuFilter.trim());
      }
      if (productCategoryFilter.trim()) {
        query.set("category", productCategoryFilter.trim());
      }
      query.set("isActive", productActiveFilter);
      query.set("limit", "500");

      const response = await fetch(`${API_BASE_URL}/api/workspace/products?${query.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        setProductMessage(`Product list failed (${response.status}).`);
        setProducts([]);
        return;
      }

      const body = (await response.json()) as { products: ProductRow[]; summary: { count: number } };
      setProducts(body.products);
      setProductMessage(`Loaded ${body.summary.count} products.`);
    } catch {
      setProducts([]);
      setProductMessage("Product list request failed.");
    } finally {
      setProductsLoading(false);
    }
  };

  const loadOrders = async (accessToken: string) => {
    setOrdersLoading(true);
    try {
      const query = new URLSearchParams();
      if (orderIdFilter.trim()) {
        query.set("orderId", orderIdFilter.trim());
      }
      if (orderStatusFilter.trim()) {
        query.set("status", orderStatusFilter.trim());
      }
      if (orderCustomerFilter.trim()) {
        query.set("customerName", orderCustomerFilter.trim());
      }
      if (orderSalesRepFilter) {
        query.set("salesRepId", orderSalesRepFilter);
      }
      if (orderDateFromFilter) {
        query.set("dateFrom", orderDateFromFilter);
      }
      if (orderDateToFilter) {
        query.set("dateTo", orderDateToFilter);
      }
      query.set("limit", "500");

      const response = await fetch(`${API_BASE_URL}/api/workspace/orders?${query.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        setOrderMessage(`Order list failed (${response.status}).`);
        setOrders([]);
        return;
      }

      const body = (await response.json()) as { orders: OrderRow[]; summary: { count: number } };
      setOrders(body.orders);
      setOrderMessage(`Loaded ${body.summary.count} orders.`);
    } catch {
      setOrders([]);
      setOrderMessage("Order list request failed.");
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadCategories = async (accessToken: string) => {
    setCategoriesLoading(true);
    try {
      const query = new URLSearchParams();
      if (categoryFilter.trim()) {
        query.set("name", categoryFilter.trim());
      }

      const response = await fetch(`${API_BASE_URL}/api/workspace/categories?${query.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        setCategoriesMessage(`Categories failed (${response.status}).`);
        setCategories([]);
        return;
      }

      const body = (await response.json()) as { categories: CategoryRow[]; summary: { count: number } };
      setCategories(body.categories);
      setCategoriesMessage(`Loaded ${body.summary.count} categories.`);
      setCategoryNames(body.categories.map((item) => item.name));
    } catch {
      setCategories([]);
      setCategoriesMessage("Categories request failed.");
    } finally {
      setCategoriesLoading(false);
    }
  };

  const loadTopProducts = async (accessToken: string) => {
    setTopProductsLoading(true);
    try {
      const query = new URLSearchParams();
      if (topProductFilterQ.trim()) {
        query.set("q", topProductFilterQ.trim());
      }
      if (topProductFilterCategory.trim()) {
        query.set("category", topProductFilterCategory.trim());
      }
      query.set("isActive", topProductFilterActive);
      query.set("limit", "500");

      const response = await fetch(`${API_BASE_URL}/api/workspace/top-products?${query.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        setTopProductsMessage(`Top products failed (${response.status}).`);
        setTopProducts([]);
        return;
      }

      const body = (await response.json()) as { topProducts: TopProductRow[]; summary: { count: number } };
      setTopProducts(body.topProducts);
      setTopProductsMessage(`Loaded ${body.summary.count} top products.`);
    } catch {
      setTopProducts([]);
      setTopProductsMessage("Top products request failed.");
    } finally {
      setTopProductsLoading(false);
    }
  };

  const loadDashboard = async (accessToken: string) => {
    setDashboardLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/workspace/dashboard`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        setDashboardMessage(`Dashboard failed (${response.status}).`);
        setDashboard(null);
        return;
      }

      const body = (await response.json()) as DashboardResponse;
      setDashboard(body);
      setDashboardMessage("Dashboard loaded.");
    } catch {
      setDashboard(null);
      setDashboardMessage("Dashboard request failed.");
    } finally {
      setDashboardLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!token) {
      return;
    }
    if (!newCategoryName.trim()) {
      setCategoriesMessage("Category name is required.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/workspace/categories`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: newCategoryName.trim() })
      });

      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setCategoriesMessage(body?.message ?? `Create category failed (${response.status}).`);
        return;
      }

      setNewCategoryName("");
      setCategoriesMessage("Category created.");
      await loadCategories(token);
      await loadMeta(token);
    } catch {
      setCategoriesMessage("Create category request failed.");
    }
  };

  const handleCreateTopProduct = async () => {
    if (!token) {
      return;
    }
    if (!newTopProductName.trim()) {
      setTopProductsMessage("Top product name is required.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/workspace/top-products`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: newTopProductName.trim(),
          sku: newTopProductSku.trim() || undefined,
          categoryName: newTopProductCategory.trim() || undefined,
          isActive: newTopProductActive
        })
      });

      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setTopProductsMessage(body?.message ?? `Create top product failed (${response.status}).`);
        return;
      }

      setNewTopProductName("");
      setNewTopProductSku("");
      setNewTopProductCategory("");
      setNewTopProductActive(true);
      setTopProductsMessage("Top product created.");
      await loadTopProducts(token);
    } catch {
      setTopProductsMessage("Create top product request failed.");
    }
  };

  const handleToggleTopProduct = async (topProductId: number, isActive: boolean) => {
    if (!token) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/workspace/top-products/${topProductId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ isActive: !isActive })
      });

      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setTopProductsMessage(body?.message ?? `Update top product failed (${response.status}).`);
        return;
      }

      setTopProductsMessage("Top product updated.");
      await loadTopProducts(token);
    } catch {
      setTopProductsMessage("Update top product request failed.");
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthMessage("Logging in...");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        setToken(null);
        setUser(null);
        setAuthMessage("Login failed.");
        return;
      }

      const body = (await response.json()) as LoginResponse;
      setToken(body.accessToken);
      setUser(body.user);
      setActiveTab("contact_list");
      setAuthMessage(`Logged as ${body.user.email} (${body.user.role})`);

      await loadMeta(body.accessToken);
      await loadContacts(body.accessToken);
      await loadProducts(body.accessToken);
      await loadOrders(body.accessToken);
      await loadCategories(body.accessToken);
      await loadTopProducts(body.accessToken);
      await loadDashboard(body.accessToken);
    } catch {
      setToken(null);
      setUser(null);
      setAuthMessage("Login request failed.");
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setAuthMessage("Logged out.");
    setContacts([]);
    setProducts([]);
    setOrders([]);
    setCategories([]);
    setTopProducts([]);
    setDashboard(null);
  };

  if (!isLoggedIn) {
    return (
      <main className="auth-layout">
        <section className="auth-card" aria-label="login screen">
          <p className="eyebrow">CRM MVP</p>
          <h1>Login</h1>
          <p className="subtitle">Sign in to access contact list, products, orders, categories, and dashboard.</p>

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

          <p className="message">{authMessage}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="crm-shell">
      <aside className="crm-sidebar">
        <div>
          <h1 className="brand">CRM MVP</h1>
          <p className="sidebar-subtitle">{user?.email}</p>
          <p className="sidebar-subtitle">{user?.role}</p>
        </div>

        <nav className="side-nav" aria-label="workspace sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? "tab-btn active" : "tab-btn"}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="status-mini">
          <strong>API:</strong> {healthStatus}
        </div>
        <div className="status-mini">
          <strong>DB:</strong> {dbStatus}
        </div>

        <button type="button" onClick={handleLogout}>
          Logout
        </button>
      </aside>

      <section className="crm-main">
        <header className="crm-topbar">
          <div className="top-tabs">
            {tabs.map((tab) => (
              <button
                key={`top-${tab.id}`}
                type="button"
                className={activeTab === tab.id ? "top-tab active" : "top-tab"}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="top-actions">
            <span className="hint">{authMessage}</span>
          </div>
        </header>

        <section className="workspace-scroll">
          {activeTab === "contact_list" && (
            <div className="workspace-grid">
              <article className="panel">
                <h2>Contact filters</h2>
                <label>
                  Name
                  <input value={contactNameFilter} onChange={(e) => setContactNameFilter(e.target.value)} />
                </label>
                <label>
                  Sales rep
                  <select value={contactSalesRepFilter} onChange={(e) => setContactSalesRepFilter(e.target.value)}>
                    <option value="">All</option>
                    {salesReps.map((rep) => (
                      <option key={rep.id} value={rep.id}>
                        {rep.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Has orders
                  <select
                    value={contactHasOrdersFilter}
                    onChange={(e) => setContactHasOrdersFilter(e.target.value as "any" | "yes" | "no")}
                  >
                    <option value="any">any</option>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </label>
                <button type="button" onClick={() => token && loadContacts(token)} disabled={contactsLoading}>
                  {contactsLoading ? "Loading..." : "Apply filters"}
                </button>
                <p className="message">{contactMessage}</p>
              </article>

              <article className="panel">
                <h2>Contact list ({contacts.length})</h2>
                <div className="customer-list">
                  {contacts.map((contact) => (
                    <article className="customer-card" key={contact.id}>
                      <h3>{contact.name}</h3>
                      <p>
                        Sales rep: <strong>{contact.currentSalesRep?.name ?? "Unassigned"}</strong>
                      </p>
                      <p>
                        Orders: <strong>{contact.ordersCount}</strong> | Notes: <strong>{contact.notesCount}</strong> | Tasks:{" "}
                        <strong>{contact.tasksCount}</strong>
                      </p>
                    </article>
                  ))}
                </div>
              </article>
            </div>
          )}

          {activeTab === "product_list" && (
            <div className="workspace-grid">
              <article className="panel">
                <h2>Product filters</h2>
                <label>
                  Name
                  <input value={productNameFilter} onChange={(e) => setProductNameFilter(e.target.value)} />
                </label>
                <label>
                  SKU
                  <input value={productSkuFilter} onChange={(e) => setProductSkuFilter(e.target.value)} />
                </label>
                <label>
                  Category
                  <input value={productCategoryFilter} onChange={(e) => setProductCategoryFilter(e.target.value)} />
                </label>
                <label>
                  Active
                  <select value={productActiveFilter} onChange={(e) => setProductActiveFilter(e.target.value as "any" | "true" | "false")}>
                    <option value="any">any</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </label>
                <button type="button" onClick={() => token && loadProducts(token)} disabled={productsLoading}>
                  {productsLoading ? "Loading..." : "Apply filters"}
                </button>
                <p className="message">{productMessage}</p>
              </article>

              <article className="panel">
                <h2>Product list ({products.length})</h2>
                <div className="customer-list">
                  {products.map((product) => (
                    <article className="customer-card" key={product.id}>
                      <h3>
                        {product.name} {product.sku ? `(${product.sku})` : ""}
                      </h3>
                      <p>
                        Category: <strong>{product.categoryName ?? "-"}</strong> | Active: <strong>{String(product.isActive)}</strong>
                      </p>
                      <p>
                        Sales: <strong>{product.turnoverNetCzk} CZK</strong> | Lines: <strong>{product.orderItemLines}</strong>
                      </p>
                    </article>
                  ))}
                </div>
              </article>
            </div>
          )}

          {activeTab === "order_list" && (
            <div className="workspace-grid">
              <article className="panel">
                <h2>Order filters</h2>
                <label>
                  Order ID
                  <input value={orderIdFilter} onChange={(e) => setOrderIdFilter(e.target.value)} />
                </label>
                <label>
                  Status
                  <input value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value)} />
                </label>
                <label>
                  Customer name
                  <input value={orderCustomerFilter} onChange={(e) => setOrderCustomerFilter(e.target.value)} />
                </label>
                <label>
                  Sales rep
                  <select value={orderSalesRepFilter} onChange={(e) => setOrderSalesRepFilter(e.target.value)}>
                    <option value="">All</option>
                    {salesReps.map((rep) => (
                      <option key={rep.id} value={rep.id}>
                        {rep.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="date-row">
                  <label>
                    Date from
                    <input type="date" value={orderDateFromFilter} onChange={(e) => setOrderDateFromFilter(e.target.value)} />
                  </label>
                  <label>
                    Date to
                    <input type="date" value={orderDateToFilter} onChange={(e) => setOrderDateToFilter(e.target.value)} />
                  </label>
                </div>
                <button type="button" onClick={() => token && loadOrders(token)} disabled={ordersLoading}>
                  {ordersLoading ? "Loading..." : "Apply filters"}
                </button>
                <p className="message">{orderMessage}</p>
              </article>

              <article className="panel">
                <h2>Order list ({orders.length})</h2>
                <div className="customer-list">
                  {orders.map((order) => (
                    <article className="customer-card" key={order.id}>
                      <h3>
                        {order.orderId} | {order.status}
                      </h3>
                      <p>
                        Customer: <strong>{order.customer.name}</strong> | Rep: <strong>{order.currentSalesRep?.name ?? "-"}</strong>
                      </p>
                      <p>
                        Product: <strong>{order.totals.productNetCzk}</strong> | Total: <strong>{order.totals.allNetCzk}</strong> CZK
                      </p>
                    </article>
                  ))}
                </div>
              </article>
            </div>
          )}

          {activeTab === "categories" && (
            <div className="workspace-grid">
              <article className="panel">
                <h2>Categories</h2>
                <label>
                  Filter categories
                  <input value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} />
                </label>
                <button type="button" onClick={() => token && loadCategories(token)} disabled={categoriesLoading}>
                  {categoriesLoading ? "Loading..." : "Apply filter"}
                </button>
                {isAdmin && (
                  <>
                    <label>
                      New category name
                      <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
                    </label>
                    <button type="button" onClick={handleCreateCategory}>
                      Create category
                    </button>
                  </>
                )}
                <p className="message">{categoriesMessage}</p>
              </article>

              <article className="panel">
                <h2>Category list ({categories.length})</h2>
                <div className="customer-list">
                  {categories.map((category) => (
                    <article className="customer-card" key={category.id}>
                      <h3>{category.name}</h3>
                      <p>
                        Sales: <strong>{category.turnoverNetCzk} CZK</strong>
                      </p>
                      <p>
                        TOP products: <strong>{category.topProductsActive}</strong> active / <strong>{category.topProductsTotal}</strong>{" "}
                        total
                      </p>
                    </article>
                  ))}
                </div>
              </article>

              <article className="panel">
                <h2>TOP products</h2>
                <label>
                  Search name/SKU
                  <input value={topProductFilterQ} onChange={(e) => setTopProductFilterQ(e.target.value)} />
                </label>
                <label>
                  Category
                  <input value={topProductFilterCategory} onChange={(e) => setTopProductFilterCategory(e.target.value)} />
                </label>
                <label>
                  Active
                  <select
                    value={topProductFilterActive}
                    onChange={(e) => setTopProductFilterActive(e.target.value as "any" | "true" | "false")}
                  >
                    <option value="any">any</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </label>
                <button type="button" onClick={() => token && loadTopProducts(token)} disabled={topProductsLoading}>
                  {topProductsLoading ? "Loading..." : "Apply filter"}
                </button>
                {isAdmin && (
                  <>
                    <label>
                      New TOP product name
                      <input value={newTopProductName} onChange={(e) => setNewTopProductName(e.target.value)} />
                    </label>
                    <label>
                      SKU
                      <input value={newTopProductSku} onChange={(e) => setNewTopProductSku(e.target.value)} />
                    </label>
                    <label>
                      Category
                      <input
                        value={newTopProductCategory}
                        list="category-names"
                        onChange={(e) => setNewTopProductCategory(e.target.value)}
                      />
                    </label>
                    <label>
                      Active
                      <select value={String(newTopProductActive)} onChange={(e) => setNewTopProductActive(e.target.value === "true")}>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    </label>
                    <button type="button" onClick={handleCreateTopProduct}>
                      Create TOP product
                    </button>
                  </>
                )}
                <p className="message">{topProductsMessage}</p>
                <datalist id="category-names">
                  {categoryNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <div className="customer-list">
                  {topProducts.map((item) => (
                    <article className="customer-card" key={item.id}>
                      <h3>
                        {item.name} {item.sku ? `(${item.sku})` : ""}
                      </h3>
                      <p>
                        Category: <strong>{item.categoryName ?? "-"}</strong> | Active: <strong>{String(item.isActive)}</strong>
                      </p>
                      <p>
                        Sales: <strong>{item.turnoverNetCzk} CZK</strong>
                      </p>
                      {isAdmin && (
                        <button type="button" onClick={() => handleToggleTopProduct(item.id, item.isActive)}>
                          Set active = {String(!item.isActive)}
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              </article>
            </div>
          )}

          {activeTab === "dashboard" && (
            <div className="workspace-grid">
              <article className="panel">
                <h2>Dashboard controls</h2>
                <button type="button" onClick={() => token && loadDashboard(token)} disabled={dashboardLoading}>
                  {dashboardLoading ? "Loading..." : "Refresh dashboard"}
                </button>
                <p className="message">{dashboardMessage}</p>
                {dashboard && (
                  <article className="customer-card">
                    <p>
                      Total sales: <strong>{dashboard.totals.productTurnoverNetCzk} CZK</strong>
                    </p>
                    <p>
                      Product lines: <strong>{dashboard.totals.productLineCount}</strong>
                    </p>
                    <p>
                      Active TOP products: <strong>{dashboard.totals.activeTopProductsCount}</strong>
                    </p>
                  </article>
                )}
              </article>

              <article className="panel">
                <h2>Category share on sales</h2>
                <details open>
                  <summary>Total</summary>
                  <ul className="history-list">
                    {dashboard?.categoryShareTotal.map((item) => (
                      <li key={item.category}>
                        {item.category}: {item.turnoverNetCzk} CZK ({item.sharePct}%)
                      </li>
                    ))}
                  </ul>
                </details>

                <details>
                  <summary>By salesmen</summary>
                  <div className="customer-list">
                    {dashboard?.categoryShareBySalesRep.map((rep) => (
                      <article className="customer-card" key={rep.salesRepId}>
                        <h3>{rep.salesRepName}</h3>
                        <p>Total: {rep.totalTurnoverNetCzk} CZK</p>
                        <ul className="history-list">
                          {rep.categories.map((item) => (
                            <li key={`${rep.salesRepId}-${item.category}`}>
                              {item.category}: {item.turnoverNetCzk} CZK ({item.sharePct}%)
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                </details>
              </article>

              <article className="panel">
                <h2>Sales of TOP products</h2>
                <details open>
                  <summary>Total</summary>
                  <ul className="history-list">
                    {dashboard?.topProductSalesTotal.map((item) => (
                      <li key={item.topProductId}>
                        {item.topProductName}: {item.turnoverNetCzk} CZK ({item.sharePct}%)
                      </li>
                    ))}
                  </ul>
                </details>

                <details>
                  <summary>By salesmen</summary>
                  <div className="customer-list">
                    {dashboard?.topProductSalesBySalesRep.map((rep) => (
                      <article className="customer-card" key={rep.salesRepId}>
                        <h3>{rep.salesRepName}</h3>
                        <p>TOP total: {rep.totalTopProductTurnoverNetCzk} CZK</p>
                        <ul className="history-list">
                          {rep.products.map((item) => (
                            <li key={`${rep.salesRepId}-${item.topProductId}`}>
                              {item.topProductName}: {item.turnoverNetCzk} CZK ({item.sharePct}%)
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                </details>
              </article>
            </div>
          )}
        </section>

        <footer className="footnote">
          API: <code>{API_BASE_URL}</code>
        </footer>
      </section>
    </main>
  );
}

export default App;
