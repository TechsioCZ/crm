import { useCallback, useEffect, useMemo, useState } from "react";
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

type DevUser = {
  email: string;
  name: string;
  role: UserRole;
  password: string;
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
  unitPriceNetCzk: string | null;
  stockQuantity: number | null;
  historicalSalesQty: number | null;
  incomingFromSupplierQty: number | null;
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

type OrderDetailResponse = {
  order: {
    id: number;
    orderId: string;
    status: string;
    importedAt: string;
    customer: {
      id: number;
      name: string;
    };
    currentSalesRep: SalesRepOption | null;
  };
  products: Array<{
    orderItemId: number;
    productId: number | null;
    productName: string;
    sku: string | null;
    unitPriceFromProductNetCzk: string | null;
    quantity: string;
    lineTotalNetCzk: string | null;
  }>;
};

type ContactDetailResponse = {
  customer: {
    id: number;
    name: string;
    createdAt: string;
    currentSalesRep: SalesRepOption | null;
    assignmentHistory: Array<{
      id: number;
      salesRepId: number;
      startedAt: string;
      endedAt: string | null;
      salesRep: SalesRepOption;
      assignedBy: {
        id: number;
        name: string;
        email: string;
      } | null;
    }>;
    summary: {
      ordersCount: number;
      notesCount: number;
      tasksCount: number;
    };
  };
  orders: Array<{
    id: number;
    orderId: string;
    status: string;
    importedAt: string;
    totals: {
      lineCount: number;
      productNetCzk: string;
      shippingNetCzk: string;
      paymentNetCzk: string;
      otherNetCzk: string;
      allNetCzk: string;
    };
  }>;
  notes: Array<{
    id: number;
    text: string;
    createdAt: string;
    author: {
      id: number;
      name: string;
      email: string;
    };
  }>;
  tasks: Array<{
    id: number;
    description: string;
    dueDate: string;
    priority: string;
    status: string;
    completedAt: string | null;
    createdAt: string;
    owner: {
      id: number;
      name: string;
      email: string;
    };
  }>;
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
  unitPriceNetCzk: string | null;
  stockQuantity: number | null;
  historicalSalesQty: number | null;
  incomingFromSupplierQty: number | null;
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
  const formatMoneyOrDash = (value: string | null) => (value === null ? "-" : `${value} CZK`);
  const formatNumberOrDash = (value: number | null) => (value === null ? "-" : value.toString());
  const moneyToNumber = (value: string) => Number.parseFloat(value);
  const formatMoney = (value: number) => value.toFixed(2);
  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const [email, setEmail] = useState("admin@crm.local");
  const [password, setPassword] = useState("Admin123!");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authMessage, setAuthMessage] = useState("Not logged in.");
  const [healthStatus, setHealthStatus] = useState("Checking...");
  const [dbStatus, setDbStatus] = useState("Checking...");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("contact_list");
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);
  const [devUsersLoading, setDevUsersLoading] = useState(false);
  const [devUsersMessage, setDevUsersMessage] = useState("Dev users not loaded yet.");
  const [newDevUserEmail, setNewDevUserEmail] = useState("");
  const [newDevUserName, setNewDevUserName] = useState("");
  const [newDevUserRole, setNewDevUserRole] = useState<UserRole>("sales_rep");
  const [newDevUserPassword, setNewDevUserPassword] = useState("");
  const [devBusyEmail, setDevBusyEmail] = useState<string | null>(null);

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
  const [orderStatusOptions, setOrderStatusOptions] = useState<string[]>([]);
  const [orderCustomerFilter, setOrderCustomerFilter] = useState("");
  const [orderSalesRepFilter, setOrderSalesRepFilter] = useState("");
  const [orderDateFromFilter, setOrderDateFromFilter] = useState("");
  const [orderDateToFilter, setOrderDateToFilter] = useState("");
  const [orderMessage, setOrderMessage] = useState("Order list not loaded yet.");
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderDetailsById, setOrderDetailsById] = useState<Record<number, OrderDetailResponse>>({});
  const [orderDetailLoadingById, setOrderDetailLoadingById] = useState<Record<number, boolean>>({});
  const [contactDetailLoadingById, setContactDetailLoadingById] = useState<Record<number, boolean>>({});

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
  const [dashboardSalesRepFilterIds, setDashboardSalesRepFilterIds] = useState<number[]>([]);

  const isLoggedIn = useMemo(() => Boolean(token), [token]);
  const isAdmin = user?.role === "admin";

  const dashboardSalesRepOptions = useMemo(() => {
    if (!dashboard) {
      return [] as Array<{ id: number; name: string }>;
    }

    return dashboard.categoryShareBySalesRep.map((rep) => ({
      id: rep.salesRepId,
      name: rep.salesRepName
    }));
  }, [dashboard]);

  const dashboardSelectedRepNames = useMemo(() => {
    if (dashboardSalesRepFilterIds.length === 0) {
      return "all salesmen";
    }

    const selectedSet = new Set(dashboardSalesRepFilterIds);
    const names = dashboardSalesRepOptions.filter((option) => selectedSet.has(option.id)).map((option) => option.name);
    return names.join(", ") || "all salesmen";
  }, [dashboardSalesRepFilterIds, dashboardSalesRepOptions]);

  const categoryShareView = useMemo(() => {
    if (!dashboard) {
      return [] as Array<{ category: string; turnoverNetCzk: string; sharePct: string }>;
    }

    if (dashboardSalesRepFilterIds.length === 0) {
      return dashboard.categoryShareTotal;
    }

    const selectedSet = new Set(dashboardSalesRepFilterIds);
    const totals = new Map<string, number>();

    for (const rep of dashboard.categoryShareBySalesRep) {
      if (!selectedSet.has(rep.salesRepId)) {
        continue;
      }
      for (const item of rep.categories) {
        const value = moneyToNumber(item.turnoverNetCzk);
        totals.set(item.category, (totals.get(item.category) ?? 0) + value);
      }
    }

    const totalTurnover = [...totals.values()].reduce((sum, value) => sum + value, 0);
    return [...totals.entries()]
      .map(([category, turnover]) => ({
        category,
        turnoverNetCzk: formatMoney(turnover),
        sharePct: totalTurnover === 0 ? "0.00" : ((turnover / totalTurnover) * 100).toFixed(2)
      }))
      .sort((left, right) => moneyToNumber(right.turnoverNetCzk) - moneyToNumber(left.turnoverNetCzk));
  }, [dashboard, dashboardSalesRepFilterIds]);

  const topProductSalesView = useMemo(() => {
    if (!dashboard) {
      return [] as Array<{ topProductId: number; topProductName: string; turnoverNetCzk: string; sharePct: string }>;
    }

    if (dashboardSalesRepFilterIds.length === 0) {
      return dashboard.topProductSalesTotal;
    }

    const selectedSet = new Set(dashboardSalesRepFilterIds);
    const totals = new Map<number, { topProductName: string; turnover: number }>();

    for (const rep of dashboard.topProductSalesBySalesRep) {
      if (!selectedSet.has(rep.salesRepId)) {
        continue;
      }

      for (const item of rep.products) {
        const current = totals.get(item.topProductId) ?? { topProductName: item.topProductName, turnover: 0 };
        current.turnover += moneyToNumber(item.turnoverNetCzk);
        totals.set(item.topProductId, current);
      }
    }

    const totalTurnover = [...totals.values()].reduce((sum, row) => sum + row.turnover, 0);
    return [...totals.entries()]
      .map(([topProductId, row]) => ({
        topProductId,
        topProductName: row.topProductName,
        turnoverNetCzk: formatMoney(row.turnover),
        sharePct: totalTurnover === 0 ? "0.00" : ((row.turnover / totalTurnover) * 100).toFixed(2)
      }))
      .sort((left, right) => moneyToNumber(right.turnoverNetCzk) - moneyToNumber(left.turnoverNetCzk));
  }, [dashboard, dashboardSalesRepFilterIds]);

  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: "contact_list", label: "contact list" },
    { id: "product_list", label: "product list" },
    { id: "order_list", label: "order list" },
    { id: "categories", label: "categories" },
    { id: "dashboard", label: "dashboard" }
  ];

  const loadDevUsers = useCallback(async () => {
    setDevUsersLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/dev-users`);
      if (!response.ok) {
        setDevUsers([]);
        setDevUsersMessage(`Dev users unavailable (${response.status}).`);
        return;
      }

      const body = (await response.json()) as { users: DevUser[]; message?: string };
      setDevUsers(body.users);
      setDevUsersMessage(body.message ?? `Loaded ${body.users.length} dev users.`);
    } catch {
      setDevUsers([]);
      setDevUsersMessage("Dev users request failed.");
    } finally {
      setDevUsersLoading(false);
    }
  }, []);

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

    const devUsersTimer = window.setTimeout(() => {
      loadDevUsers().catch(() => {
        setDevUsersMessage("Dev users request failed.");
      });
    }, 0);

    return () => {
      window.clearTimeout(devUsersTimer);
    };
  }, [loadDevUsers]);

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
        orderStatuses: string[];
      };
      setSalesReps(body.salesReps);
      setCategoryNames(body.categories.map((item) => item.name));
      setOrderStatusOptions(body.orderStatuses);
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

  const loadContactDetail = async (accessToken: string, customerId: number): Promise<ContactDetailResponse | null> => {
    setContactDetailLoadingById((prev) => ({ ...prev, [customerId]: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/workspace/contacts/${customerId}/detail`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        setContactMessage(`Contact detail failed (${response.status}) for customer ${customerId}.`);
        return null;
      }

      return (await response.json()) as ContactDetailResponse;
    } catch {
      setContactMessage(`Contact detail request failed for customer ${customerId}.`);
      return null;
    } finally {
      setContactDetailLoadingById((prev) => ({ ...prev, [customerId]: false }));
    }
  };

  const handleOpenContactWindow = async (contact: ContactRow) => {
    if (!token) {
      return;
    }

    const contactWindow = window.open("", "_blank", "width=1180,height=820");
    if (!contactWindow) {
      setContactMessage("Popup blocked. Please allow popups for this app.");
      return;
    }

    const loadingHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Client ${escapeHtml(contact.name)}</title></head><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f6f8fc;color:#1f2937"><h2>Loading client ${escapeHtml(contact.name)}...</h2></body></html>`;
    contactWindow.document.open();
    contactWindow.document.write(loadingHtml);
    contactWindow.document.close();

    const detail = await loadContactDetail(token, contact.id);
    if (!detail) {
      const failHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Client ${escapeHtml(contact.name)}</title></head><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f6f8fc;color:#1f2937"><h2>Client detail is not available.</h2><p>Please close this window and try again.</p></body></html>`;
      contactWindow.document.open();
      contactWindow.document.write(failHtml);
      contactWindow.document.close();
      return;
    }

    const assignmentRowsHtml = detail.customer.assignmentHistory
      .map((assignment) => {
        const assignedBy = assignment.assignedBy?.name ?? "-";
        const endedAt = assignment.endedAt ? new Date(assignment.endedAt).toLocaleString() : "active";
        return `<tr><td>${escapeHtml(assignment.salesRep.name)}</td><td>${escapeHtml(new Date(assignment.startedAt).toLocaleString())}</td><td>${escapeHtml(endedAt)}</td><td>${escapeHtml(assignedBy)}</td></tr>`;
      })
      .join("");

    const ordersRowsHtml = detail.orders
      .map((order) => {
        return `<tr><td>${escapeHtml(order.orderId)}</td><td>${escapeHtml(order.status)}</td><td>${escapeHtml(new Date(order.importedAt).toLocaleString())}</td><td>${escapeHtml(order.totals.productNetCzk)}</td><td>${escapeHtml(order.totals.allNetCzk)}</td><td>${order.totals.lineCount}</td></tr>`;
      })
      .join("");

    const notesRowsHtml = detail.notes
      .map((note) => {
        return `<tr><td>${escapeHtml(new Date(note.createdAt).toLocaleString())}</td><td>${escapeHtml(note.author.name)}</td><td>${escapeHtml(note.text)}</td></tr>`;
      })
      .join("");

    const tasksRowsHtml = detail.tasks
      .map((task) => {
        const doneAt = task.completedAt ? new Date(task.completedAt).toLocaleString() : "-";
        return `<tr><td>${escapeHtml(task.dueDate.slice(0, 10))}</td><td>${escapeHtml(task.priority)}</td><td>${escapeHtml(task.status)}</td><td>${escapeHtml(task.owner.name)}</td><td>${escapeHtml(task.description)}</td><td>${escapeHtml(doneAt)}</td></tr>`;
      })
      .join("");

    const fullHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Client ${escapeHtml(detail.customer.name)}</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;margin:0;background:#eef2f7;color:#1d2a3a}
    .wrap{max-width:1200px;margin:0 auto;padding:24px}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:12px}
    .card{background:#fff;border:1px solid #d6dbe7;border-radius:12px;padding:16px;margin-bottom:12px}
    h1{margin:0 0 8px;font-size:30px}
    h2{margin:0 0 10px;font-size:20px}
    p{margin:4px 0}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #d6dbe7;padding:8px;text-align:left;vertical-align:top}
    th{background:#f8f9fc}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${escapeHtml(detail.customer.name)}</h1>
      <p>Customer id: <strong>${detail.customer.id}</strong></p>
      <p>Current sales rep: <strong>${escapeHtml(detail.customer.currentSalesRep?.name ?? "Unassigned")}</strong></p>
      <p>Created at: <strong>${escapeHtml(new Date(detail.customer.createdAt).toLocaleString())}</strong></p>
    </div>

    <div class="card grid">
      <div>
        <p>Orders: <strong>${detail.customer.summary.ordersCount}</strong></p>
      </div>
      <div>
        <p>Notes: <strong>${detail.customer.summary.notesCount}</strong></p>
      </div>
      <div>
        <p>Tasks: <strong>${detail.customer.summary.tasksCount}</strong></p>
      </div>
    </div>

    <div class="card">
      <h2>Orders (${detail.orders.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Status</th>
            <th>Imported at</th>
            <th>Product CZK</th>
            <th>Total CZK</th>
            <th>Lines</th>
          </tr>
        </thead>
        <tbody>
          ${ordersRowsHtml || '<tr><td colspan="6">No orders.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>Assignment history (${detail.customer.assignmentHistory.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Sales rep</th>
            <th>Started</th>
            <th>Ended</th>
            <th>Assigned by</th>
          </tr>
        </thead>
        <tbody>
          ${assignmentRowsHtml || '<tr><td colspan="4">No assignments.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>Notes (${detail.notes.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Created</th>
            <th>Author</th>
            <th>Text</th>
          </tr>
        </thead>
        <tbody>
          ${notesRowsHtml || '<tr><td colspan="3">No notes.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>Tasks (${detail.tasks.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Due date</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Description</th>
            <th>Completed</th>
          </tr>
        </thead>
        <tbody>
          ${tasksRowsHtml || '<tr><td colspan="6">No tasks.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;

    contactWindow.document.open();
    contactWindow.document.write(fullHtml);
    contactWindow.document.close();
  };

  const handleOpenCategoryWindow = async (categoryName: string) => {
    if (!token) {
      return;
    }

    const categoryWindow = window.open("", "_blank", "width=1080,height=760");
    if (!categoryWindow) {
      setCategoriesMessage("Popup blocked. Please allow popups for this app.");
      return;
    }

    const loadingHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Category ${escapeHtml(categoryName)}</title></head><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f6f8fc;color:#1f2937"><h2>Loading category ${escapeHtml(categoryName)}...</h2></body></html>`;
    categoryWindow.document.open();
    categoryWindow.document.write(loadingHtml);
    categoryWindow.document.close();

    try {
      const query = new URLSearchParams();
      query.set("category", categoryName);
      query.set("limit", "500");

      const response = await fetch(`${API_BASE_URL}/api/workspace/products?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        setCategoriesMessage(`Category products failed (${response.status}).`);
        const failHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Category ${escapeHtml(categoryName)}</title></head><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f6f8fc;color:#1f2937"><h2>Category products are not available.</h2><p>Please close this window and try again.</p></body></html>`;
        categoryWindow.document.open();
        categoryWindow.document.write(failHtml);
        categoryWindow.document.close();
        return;
      }

      const body = (await response.json()) as { products: ProductRow[]; summary: { count: number } };
      const rowsHtml = body.products
        .map((product) => {
          return `<tr><td>${escapeHtml(product.name)}</td><td>${escapeHtml(product.sku ?? "-")}</td><td>${escapeHtml(product.categoryName ?? "-")}</td><td>${escapeHtml(product.turnoverNetCzk)}</td><td>${escapeHtml(formatMoneyOrDash(product.unitPriceNetCzk))}</td><td>${escapeHtml(String(product.isActive))}</td></tr>`;
        })
        .join("");

      const fullHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Category ${escapeHtml(categoryName)}</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;margin:0;background:#eef2f7;color:#1d2a3a}
    .wrap{max-width:1100px;margin:0 auto;padding:24px}
    .card{background:#fff;border:1px solid #d6dbe7;border-radius:12px;padding:16px}
    h1{margin:0 0 10px;font-size:28px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #d6dbe7;padding:8px;text-align:left;vertical-align:top}
    th{background:#f8f9fc}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Category: ${escapeHtml(categoryName)} (${body.summary.count} products)</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>SKU</th>
            <th>Category</th>
            <th>Sales CZK</th>
            <th>Unit price</th>
            <th>In TOP list</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="6">No products in this category.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;

      categoryWindow.document.open();
      categoryWindow.document.write(fullHtml);
      categoryWindow.document.close();
    } catch {
      setCategoriesMessage("Category products request failed.");
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
      setOrderDetailsById({});
      setOrderDetailLoadingById({});
      setOrderMessage(`Loaded ${body.summary.count} orders.`);
    } catch {
      setOrders([]);
      setOrderMessage("Order list request failed.");
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadOrderDetail = async (accessToken: string, orderDbId: number): Promise<OrderDetailResponse | null> => {
    setOrderDetailLoadingById((prev) => ({ ...prev, [orderDbId]: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/workspace/orders/${orderDbId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        setOrderMessage(`Order detail failed (${response.status}) for order DB id ${orderDbId}.`);
        return null;
      }

      const body = (await response.json()) as OrderDetailResponse;
      setOrderDetailsById((prev) => ({
        ...prev,
        [orderDbId]: body
      }));
      return body;
    } catch {
      setOrderMessage(`Order detail request failed for order DB id ${orderDbId}.`);
      return null;
    } finally {
      setOrderDetailLoadingById((prev) => ({ ...prev, [orderDbId]: false }));
    }
  };

  const handleOpenOrderWindow = async (order: OrderRow) => {
    if (!token) {
      return;
    }

    const orderWindow = window.open("", "_blank", "width=1080,height=760");
    if (!orderWindow) {
      setOrderMessage("Popup blocked. Please allow popups for this app.");
      return;
    }

    const loadingHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Order ${escapeHtml(order.orderId)}</title></head><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f6f8fc;color:#1f2937"><h2>Loading order ${escapeHtml(order.orderId)}...</h2></body></html>`;
    orderWindow.document.open();
    orderWindow.document.write(loadingHtml);
    orderWindow.document.close();

    const detail = orderDetailsById[order.id] ?? (await loadOrderDetail(token, order.id));

    if (!detail) {
      const failHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Order ${escapeHtml(order.orderId)}</title></head><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f6f8fc;color:#1f2937"><h2>Order detail is not available.</h2><p>Please close this window and try again.</p></body></html>`;
      orderWindow.document.open();
      orderWindow.document.write(failHtml);
      orderWindow.document.close();
      return;
    }

    const rowsHtml = detail.products
      .map((line) => {
        const productName = escapeHtml(line.productName);
        const sku = line.sku ? ` (${escapeHtml(line.sku)})` : "";
        const unitPrice = line.unitPriceFromProductNetCzk ? `${escapeHtml(line.unitPriceFromProductNetCzk)} CZK` : "-";
        const qty = escapeHtml(line.quantity);
        const lineTotal = line.lineTotalNetCzk ? `${escapeHtml(line.lineTotalNetCzk)} CZK` : "-";
        return `<tr><td>${productName}${sku}</td><td>${unitPrice}</td><td>${qty}</td><td>${lineTotal}</td></tr>`;
      })
      .join("");

    const fullHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Order ${escapeHtml(detail.order.orderId)}</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;margin:0;background:#eef2f7;color:#1d2a3a}
    .wrap{max-width:1080px;margin:0 auto;padding:24px}
    .card{background:#fff;border:1px solid #d6dbe7;border-radius:12px;padding:16px;margin-bottom:16px}
    h1{margin:0 0 8px;font-size:28px}
    h2{margin:0 0 10px;font-size:20px}
    p{margin:4px 0}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #d6dbe7;padding:8px;text-align:left;vertical-align:top}
    th{background:#f8f9fc}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Order ${escapeHtml(detail.order.orderId)}</h1>
      <p>Status: <strong>${escapeHtml(detail.order.status)}</strong></p>
      <p>Customer: <strong>${escapeHtml(detail.order.customer.name)}</strong></p>
      <p>Sales rep: <strong>${escapeHtml(detail.order.currentSalesRep?.name ?? "-")}</strong></p>
      <p>Imported at: <strong>${escapeHtml(new Date(detail.order.importedAt).toLocaleString())}</strong></p>
    </div>
    <div class="card">
      <h2>Products (${detail.products.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Unit price</th>
            <th>Quantity</th>
            <th>Line total</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="4">No product lines in this order.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;

    orderWindow.document.open();
    orderWindow.document.write(fullHtml);
    orderWindow.document.close();
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
      setDashboardSalesRepFilterIds([]);
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
        const failMessage = body?.message ?? `Update top product failed (${response.status}).`;
        setTopProductsMessage(failMessage);
        setProductMessage(failMessage);
        return;
      }

      const actionMessage = isActive ? "Product removed from TOP list." : "Product added to TOP list.";
      setTopProductsMessage(actionMessage);
      setProductMessage(actionMessage);
      await Promise.all([loadTopProducts(token), loadProducts(token), loadCategories(token)]);
    } catch {
      setTopProductsMessage("Update top product request failed.");
      setProductMessage("Update top product request failed.");
    }
  };

  const loginWithCredentials = async (loginEmail: string, loginPassword: string) => {
    setAuthMessage("Logging in...");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
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

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loginWithCredentials(email, password);
  };

  const handleQuickLoginAsDevUser = async (devUser: DevUser) => {
    setEmail(devUser.email);
    setPassword(devUser.password);
    await loginWithCredentials(devUser.email, devUser.password);
  };

  const handleUpsertDevUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!newDevUserEmail.trim() || !newDevUserName.trim() || !newDevUserPassword.trim()) {
      setDevUsersMessage("Email, name and password are required.");
      return;
    }

    setDevBusyEmail(newDevUserEmail.trim().toLowerCase());
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/dev-users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newDevUserEmail.trim().toLowerCase(),
          name: newDevUserName.trim(),
          role: newDevUserRole,
          password: newDevUserPassword
        })
      });

      const body = (await response.json().catch(() => null)) as { users?: DevUser[]; message?: string } | null;
      if (!response.ok || !body?.users) {
        setDevUsersMessage(body?.message ?? `Saving dev user failed (${response.status}).`);
        return;
      }

      setDevUsers(body.users);
      setDevUsersMessage(body.message ?? "Dev user saved.");
      setNewDevUserEmail("");
      setNewDevUserName("");
      setNewDevUserRole("sales_rep");
      setNewDevUserPassword("");
    } catch {
      setDevUsersMessage("Saving dev user failed.");
    } finally {
      setDevBusyEmail(null);
    }
  };

  const handleDeleteDevUser = async (targetEmail: string) => {
    setDevBusyEmail(targetEmail);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/dev-users/${encodeURIComponent(targetEmail)}`, {
        method: "DELETE"
      });

      const body = (await response.json().catch(() => null)) as { users?: DevUser[]; message?: string } | null;
      if (!response.ok || !body?.users) {
        setDevUsersMessage(body?.message ?? `Deleting dev user failed (${response.status}).`);
        return;
      }

      setDevUsers(body.users);
      setDevUsersMessage(body.message ?? "Dev user deleted.");
    } catch {
      setDevUsersMessage("Deleting dev user failed.");
    } finally {
      setDevBusyEmail(null);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setAuthMessage("Logged out.");
    setContacts([]);
    setProducts([]);
    setOrders([]);
    setOrderStatusOptions([]);
    setOrderDetailsById({});
    setOrderDetailLoadingById({});
    setContactDetailLoadingById({});
    setCategories([]);
    setTopProducts([]);
    setDashboard(null);
    setDashboardSalesRepFilterIds([]);
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

          <section className="dev-users-section" aria-label="development users manager">
            <div className="dev-users-head">
              <h2>Development Users</h2>
              <button type="button" onClick={() => loadDevUsers()} disabled={devUsersLoading}>
                {devUsersLoading ? "Refreshing..." : "Refresh list"}
              </button>
            </div>
            <p className="hint">{devUsersMessage}</p>

            <form className="form" onSubmit={handleUpsertDevUser}>
              <label>
                New user email
                <input value={newDevUserEmail} onChange={(e) => setNewDevUserEmail(e.target.value)} />
              </label>
              <label>
                New user name
                <input value={newDevUserName} onChange={(e) => setNewDevUserName(e.target.value)} />
              </label>
              <label>
                Role
                <select value={newDevUserRole} onChange={(e) => setNewDevUserRole(e.target.value as UserRole)}>
                  <option value="sales_rep">sales_rep</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label>
                Password
                <input value={newDevUserPassword} onChange={(e) => setNewDevUserPassword(e.target.value)} />
              </label>
              <button type="submit" disabled={Boolean(devBusyEmail)}>
                Save dev user
              </button>
            </form>

            <div className="customer-list">
              {devUsers.map((devUser) => {
                const isBusy = devBusyEmail === devUser.email;
                return (
                  <article className="customer-card" key={devUser.email}>
                    <h3>{devUser.name}</h3>
                    <p>
                      <strong>{devUser.email}</strong>
                    </p>
                    <p>
                      Role: <strong>{devUser.role}</strong>
                    </p>
                    <p>
                      Password: <strong>{devUser.password}</strong>
                    </p>
                    <div className="actions">
                      <button
                        type="button"
                        onClick={() => {
                          setEmail(devUser.email);
                          setPassword(devUser.password);
                        }}
                        disabled={isBusy}
                      >
                        Use credentials
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setDevBusyEmail(devUser.email);
                          await handleQuickLoginAsDevUser(devUser);
                          setDevBusyEmail(null);
                        }}
                        disabled={isBusy}
                      >
                        Login as this user
                      </button>
                      <button type="button" onClick={() => handleDeleteDevUser(devUser.email)} disabled={isBusy}>
                        Delete user
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
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
                  {contacts.map((contact) => {
                    const detailLoading = contactDetailLoadingById[contact.id] ?? false;
                    return (
                      <article className="customer-card" key={contact.id}>
                        <h3>{contact.name}</h3>
                        <p>
                          Sales rep: <strong>{contact.currentSalesRep?.name ?? "Unassigned"}</strong>
                        </p>
                        <p>
                          Orders: <strong>{contact.ordersCount}</strong> | Notes: <strong>{contact.notesCount}</strong> | Tasks:{" "}
                          <strong>{contact.tasksCount}</strong>
                        </p>
                        <button type="button" onClick={() => handleOpenContactWindow(contact)} disabled={detailLoading}>
                          {detailLoading ? "Opening..." : "Open client detail"}
                        </button>
                      </article>
                    );
                  })}
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
                      <p>
                        Unit price: <strong>{formatMoneyOrDash(product.unitPriceNetCzk)}</strong>
                      </p>
                      <p>
                        Stock: <strong>{formatNumberOrDash(product.stockQuantity)}</strong> | Historical sales:{" "}
                        <strong>{formatNumberOrDash(product.historicalSalesQty)}</strong> | Incoming:{" "}
                        <strong>{formatNumberOrDash(product.incomingFromSupplierQty)}</strong>
                      </p>
                      <button type="button" onClick={() => handleToggleTopProduct(product.id, product.isActive)}>
                        {product.isActive ? "Remove from TOP list" : "Add to TOP list"}
                      </button>
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
                  <select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value)}>
                    <option value="">All</option>
                    {orderStatusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
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
                  {orders.map((order) => {
                    const detailLoading = orderDetailLoadingById[order.id] ?? false;

                    return (
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
                        <button type="button" onClick={() => handleOpenOrderWindow(order)} disabled={detailLoading}>
                          {detailLoading ? "Opening..." : "Open in new window"}
                        </button>
                      </article>
                    );
                  })}
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
                      <button type="button" onClick={() => handleOpenCategoryWindow(category.name)}>
                        Open products in category
                      </button>
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
                      <p>
                        Unit price: <strong>{formatMoneyOrDash(item.unitPriceNetCzk)}</strong>
                      </p>
                      <p>
                        Stock: <strong>{formatNumberOrDash(item.stockQuantity)}</strong> | Historical sales:{" "}
                        <strong>{formatNumberOrDash(item.historicalSalesQty)}</strong> | Incoming:{" "}
                        <strong>{formatNumberOrDash(item.incomingFromSupplierQty)}</strong>
                      </p>
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
                <p className="hint">Filter by salesmen (multi-select)</p>
                <div className="multi-checklist">
                  {dashboardSalesRepOptions.map((rep) => (
                    <label key={rep.id} className="inline-check">
                      <input
                        type="checkbox"
                        checked={dashboardSalesRepFilterIds.includes(rep.id)}
                        onChange={(event) => {
                          setDashboardSalesRepFilterIds((prev) => {
                            if (event.target.checked) {
                              return [...prev, rep.id];
                            }
                            return prev.filter((id) => id !== rep.id);
                          });
                        }}
                      />
                      {rep.name}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setDashboardSalesRepFilterIds([])}
                  disabled={dashboardSalesRepFilterIds.length === 0}
                >
                  Clear salesman filter
                </button>
                <button type="button" onClick={() => token && loadDashboard(token)} disabled={dashboardLoading}>
                  {dashboardLoading ? "Loading..." : "Refresh dashboard"}
                </button>
                <p className="message">{dashboardMessage}</p>
                <p className="hint">Current filter: {dashboardSelectedRepNames}</p>
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
                <ul className="history-list">
                  {categoryShareView.map((item) => (
                    <li key={item.category}>
                      {item.category}: {item.turnoverNetCzk} CZK ({item.sharePct}%)
                    </li>
                  ))}
                </ul>
              </article>

              <article className="panel">
                <h2>Sales of TOP products</h2>
                <ul className="history-list">
                  {topProductSalesView.map((item) => (
                    <li key={item.topProductId}>
                      {item.topProductName}: {item.turnoverNetCzk} CZK ({item.sharePct}%)
                    </li>
                  ))}
                </ul>
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
