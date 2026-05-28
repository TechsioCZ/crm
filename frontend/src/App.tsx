import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type UserRole = "admin" | "sales_rep";
type WorkspaceTab = "contact_list" | "product_list" | "order_list" | "categories" | "staff" | "dashboard";

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

type StaffSalesRepRow = SalesRepOption & {
  isActive: boolean;
  createdAt: string;
  activeCustomerCount: number;
};

type StaffCustomerAssignment = {
  id: number;
  customerId: number;
  salesRepId: number;
  assignedById: number | null;
  startedAt: string;
  endedAt: string | null;
  salesRep: SalesRepOption;
  assignedBy: SalesRepOption | null;
};

type StaffCustomerRow = {
  id: number;
  name: string;
  currentAssignment: StaffCustomerAssignment | null;
  assignmentHistory: StaffCustomerAssignment[];
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

type CrmWindowWithOrderOpener = Window & {
  crmOpenOrderWindowById?: (orderDbId: number) => void;
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

type DashboardComparisonSalesRep = {
  salesRepId: number;
  salesRepName: string;
  categoryTotalTurnoverNetCzk: string;
  topProductTotalTurnoverNetCzk: string;
  categories: DashboardResponse["categoryShareBySalesRep"][number]["categories"];
  products: DashboardResponse["topProductSalesBySalesRep"][number]["products"];
};

type ImportKind = "customers" | "products" | "orders";

type ImportResponse = {
  message: string;
  run?: {
    id: number;
    totalRecords: number;
    createdOrders: number;
    updatedOrders: number;
    errorRecords: number;
    startedAt: string;
    finishedAt: string | null;
  };
  errors?: Array<{
    recordIndex: number;
    message: string;
  }>;
};

const IMPORT_TEMPLATES: Record<ImportKind, { filename: string; xml: string }> = {
  customers: {
    filename: "customers-import-template.xml",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<customers>
  <customer>
    <customer_id>1001</customer_id>
    <name>ACME s.r.o.</name>
    <sales_rep_email>sales01@crm.local</sales_rep_email>
  </customer>
  <customer>
    <customer_id>1002</customer_id>
    <name>Blue River a.s.</name>
    <sales_rep_name>Obchodnik 02</sales_rep_name>
  </customer>
</customers>
`
  },
  products: {
    filename: "products-import-template.xml",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<products>
  <product>
    <sku>SKU-1001</sku>
    <name>Hydraulic Pump A1</name>
    <category_name>Pumps</category_name>
    <unit_price_net_czk>1299.90</unit_price_net_czk>
    <stock_quantity>12</stock_quantity>
    <historical_sales_qty>340</historical_sales_qty>
    <incoming_from_supplier_qty>20</incoming_from_supplier_qty>
    <is_active>true</is_active>
  </product>
  <product>
    <sku>SKU-1002</sku>
    <name>Seal Kit B2</name>
    <category_name>Accessories</category_name>
    <unit_price_net_czk>89.50</unit_price_net_czk>
    <stock_quantity>150</stock_quantity>
    <historical_sales_qty>1200</historical_sales_qty>
    <incoming_from_supplier_qty>80</incoming_from_supplier_qty>
    <is_active>true</is_active>
  </product>
</products>
`
  },
  orders: {
    filename: "orders-import-template.xml",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<orders>
  <order_line>
    <order_id>ORD-2026-0001</order_id>
    <customer_id>1001</customer_id>
    <status>confirmed</status>
    <imported_at>2026-05-26T10:30:00Z</imported_at>
    <line_type>product</line_type>
    <sku>SKU-1001</sku>
    <name>Hydraulic Pump A1</name>
    <category_name>Pumps</category_name>
    <quantity>2</quantity>
    <unit_price_net_czk>1299.90</unit_price_net_czk>
    <line_net_czk>2599.80</line_net_czk>
  </order_line>
  <order_line>
    <order_id>ORD-2026-0001</order_id>
    <customer_id>1001</customer_id>
    <status>confirmed</status>
    <imported_at>2026-05-26T10:30:00Z</imported_at>
    <line_type>shipping</line_type>
    <name>Shipping</name>
    <quantity>1</quantity>
    <unit_price_net_czk>120.00</unit_price_net_czk>
    <line_net_czk>120.00</line_net_czk>
  </order_line>
  <order_line>
    <order_id>ORD-2026-0002</order_id>
    <customer_id>1002</customer_id>
    <status>new</status>
    <imported_at>2026-05-27T09:00:00Z</imported_at>
    <line_type>product</line_type>
    <sku>SKU-1002</sku>
    <name>Seal Kit B2</name>
    <category_name>Accessories</category_name>
    <quantity>10</quantity>
    <unit_price_net_czk>89.50</unit_price_net_czk>
    <line_net_czk>895.00</line_net_czk>
  </order_line>
</orders>
`
  }
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

function App() {
  const formatMoneyOrDash = (value: string | null) => (value === null ? "-" : `${value} CZK`);
  const formatNumberOrDash = (value: number | null) => (value === null ? "-" : value.toString());
  const moneyToNumber = (value: string) => Number.parseFloat(value);
  const formatMoney = (value: number) => value.toFixed(2);
  const escapeHtml = useCallback(
    (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;"),
    []
  );

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
  const [productActiveFilter, setProductActiveFilter] = useState<"any" | "true" | "false">("true");
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
  const [mergeCategoryAId, setMergeCategoryAId] = useState("");
  const [mergeCategoryBId, setMergeCategoryBId] = useState("");
  const [mergeCategoryName, setMergeCategoryName] = useState("");
  const [categoriesMessage, setCategoriesMessage] = useState("Categories not loaded yet.");
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  const [topProducts, setTopProducts] = useState<TopProductRow[]>([]);
  const [topProductFilterQ, setTopProductFilterQ] = useState("");
  const [topProductFilterCategory, setTopProductFilterCategory] = useState("");
  const [topProductFilterActive, setTopProductFilterActive] = useState<"any" | "true" | "false">("true");
  const [newTopProductName, setNewTopProductName] = useState("");
  const [newTopProductSku, setNewTopProductSku] = useState("");
  const [newTopProductCategory, setNewTopProductCategory] = useState("");
  const [newTopProductActive, setNewTopProductActive] = useState(true);
  const [topProductsMessage, setTopProductsMessage] = useState("Top products not loaded yet.");
  const [topProductsLoading, setTopProductsLoading] = useState(false);

  const [customerImportFile, setCustomerImportFile] = useState<File | null>(null);
  const [productImportFile, setProductImportFile] = useState<File | null>(null);
  const [orderImportFile, setOrderImportFile] = useState<File | null>(null);
  const [customerImportLoading, setCustomerImportLoading] = useState(false);
  const [productImportLoading, setProductImportLoading] = useState(false);
  const [orderImportLoading, setOrderImportLoading] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [dashboardMessage, setDashboardMessage] = useState("Dashboard not loaded yet.");
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardSalesRepFilterIds, setDashboardSalesRepFilterIds] = useState<number[]>([]);
  const [dashboardComparisonDialogOpen, setDashboardComparisonDialogOpen] = useState(false);
  const [dashboardComparisonGroupAIds, setDashboardComparisonGroupAIds] = useState<number[]>([]);
  const [dashboardComparisonGroupBIds, setDashboardComparisonGroupBIds] = useState<number[]>([]);

  const [staffSalesReps, setStaffSalesReps] = useState<StaffSalesRepRow[]>([]);
  const [staffCustomers, setStaffCustomers] = useState<StaffCustomerRow[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffMessage, setStaffMessage] = useState("Staff not loaded yet.");
  const [staffCreateName, setStaffCreateName] = useState("");
  const [staffCreateEmail, setStaffCreateEmail] = useState("");
  const [staffCreatePassword, setStaffCreatePassword] = useState("");
  const [staffEditSalesRepId, setStaffEditSalesRepId] = useState("");
  const [staffEditName, setStaffEditName] = useState("");
  const [staffEditEmail, setStaffEditEmail] = useState("");
  const [staffEditPassword, setStaffEditPassword] = useState("");
  const [staffDeactivateTargetByRepId, setStaffDeactivateTargetByRepId] = useState<Record<number, string>>({});
  const [staffCustomerNameFilter, setStaffCustomerNameFilter] = useState("");
  const [staffCustomerCurrentRepFilter, setStaffCustomerCurrentRepFilter] = useState("");
  const [staffSelectedCustomerIds, setStaffSelectedCustomerIds] = useState<number[]>([]);
  const [staffAssignTargetSalesRepId, setStaffAssignTargetSalesRepId] = useState("");

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

  const orderDashboardSalesRepIds = useCallback(
    (selectedSet: Set<number>) =>
      dashboardSalesRepOptions
        .filter((option) => selectedSet.has(option.id))
        .map((option) => option.id),
    [dashboardSalesRepOptions]
  );

  const dashboardComparisonRepById = useMemo(() => {
    if (!dashboard) {
      return new Map<number, DashboardComparisonSalesRep>();
    }

    const topProductByRepId = new Map(dashboard.topProductSalesBySalesRep.map((rep) => [rep.salesRepId, rep] as const));
    return new Map<number, DashboardComparisonSalesRep>(
      dashboard.categoryShareBySalesRep.map((rep) => {
        const topProductRep = topProductByRepId.get(rep.salesRepId);
        return [
          rep.salesRepId,
          {
            salesRepId: rep.salesRepId,
            salesRepName: rep.salesRepName,
            categoryTotalTurnoverNetCzk: rep.totalTurnoverNetCzk,
            topProductTotalTurnoverNetCzk: topProductRep?.totalTopProductTurnoverNetCzk ?? "0.00",
            categories: rep.categories,
            products: topProductRep?.products ?? []
          }
        ];
      })
    );
  }, [dashboard]);

  const dashboardComparisonGroupAReps = useMemo(
    () =>
      dashboardComparisonGroupAIds
        .map((id) => dashboardComparisonRepById.get(id))
        .filter((rep): rep is DashboardComparisonSalesRep => Boolean(rep)),
    [dashboardComparisonGroupAIds, dashboardComparisonRepById]
  );

  const dashboardComparisonGroupBReps = useMemo(
    () =>
      dashboardComparisonGroupBIds
        .map((id) => dashboardComparisonRepById.get(id))
        .filter((rep): rep is DashboardComparisonSalesRep => Boolean(rep)),
    [dashboardComparisonGroupBIds, dashboardComparisonRepById]
  );

  const dashboardComparisonGroupASummary = useMemo(() => {
    const categoryTotal = dashboardComparisonGroupAReps.reduce((sum, rep) => sum + moneyToNumber(rep.categoryTotalTurnoverNetCzk), 0);
    const topProductTotal = dashboardComparisonGroupAReps.reduce((sum, rep) => sum + moneyToNumber(rep.topProductTotalTurnoverNetCzk), 0);
    return {
      salesmenCount: dashboardComparisonGroupAReps.length,
      categoryTotalTurnoverNetCzk: formatMoney(categoryTotal),
      topProductTotalTurnoverNetCzk: formatMoney(topProductTotal)
    };
  }, [dashboardComparisonGroupAReps]);

  const dashboardComparisonGroupBSummary = useMemo(() => {
    const categoryTotal = dashboardComparisonGroupBReps.reduce((sum, rep) => sum + moneyToNumber(rep.categoryTotalTurnoverNetCzk), 0);
    const topProductTotal = dashboardComparisonGroupBReps.reduce((sum, rep) => sum + moneyToNumber(rep.topProductTotalTurnoverNetCzk), 0);
    return {
      salesmenCount: dashboardComparisonGroupBReps.length,
      categoryTotalTurnoverNetCzk: formatMoney(categoryTotal),
      topProductTotalTurnoverNetCzk: formatMoney(topProductTotal)
    };
  }, [dashboardComparisonGroupBReps]);

  const dashboardCanCompareGroups = dashboardComparisonGroupAIds.length > 0 && dashboardComparisonGroupBIds.length > 0;

  const openDashboardComparisonDialog = () => {
    const allSalesRepIds = dashboardSalesRepOptions.map((option) => option.id);
    if (allSalesRepIds.length === 0) {
      return;
    }

    const filteredIds = dashboardSalesRepOptions
      .filter((option) => dashboardSalesRepFilterIds.includes(option.id))
      .map((option) => option.id);
    const defaultGroupAIds = filteredIds.length > 0 ? filteredIds : [allSalesRepIds[0]];

    setDashboardComparisonGroupAIds(defaultGroupAIds);
    setDashboardComparisonGroupBIds(allSalesRepIds);
    setDashboardComparisonDialogOpen(true);
  };

  const dashboardCategoryComparisonRows = useMemo(() => {
    const aggregateGroupCategories = (reps: DashboardComparisonSalesRep[]) => {
      const byCategory = new Map<string, number>();
      for (const rep of reps) {
        for (const item of rep.categories) {
          const turnover = moneyToNumber(item.turnoverNetCzk);
          byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + turnover);
        }
      }
      const totalTurnover = [...byCategory.values()].reduce((sum, value) => sum + value, 0);
      return { byCategory, totalTurnover };
    };

    const groupA = aggregateGroupCategories(dashboardComparisonGroupAReps);
    const groupB = aggregateGroupCategories(dashboardComparisonGroupBReps);
    const categories = new Set([...groupA.byCategory.keys(), ...groupB.byCategory.keys()]);

    return [...categories]
      .map((category) => {
        const groupATurnover = groupA.byCategory.get(category) ?? 0;
        const groupBTurnover = groupB.byCategory.get(category) ?? 0;
        const hasGroupA = groupA.byCategory.has(category);
        const hasGroupB = groupB.byCategory.has(category);

        return {
          category,
          totalTurnover: groupATurnover + groupBTurnover,
          groupA: hasGroupA
            ? {
                turnoverNetCzk: formatMoney(groupATurnover),
                sharePct: groupA.totalTurnover === 0 ? "0.00" : ((groupATurnover / groupA.totalTurnover) * 100).toFixed(2)
              }
            : null,
          groupB: hasGroupB
            ? {
                turnoverNetCzk: formatMoney(groupBTurnover),
                sharePct: groupB.totalTurnover === 0 ? "0.00" : ((groupBTurnover / groupB.totalTurnover) * 100).toFixed(2)
              }
            : null
        };
      })
      .sort((left, right) => right.totalTurnover - left.totalTurnover);
  }, [dashboardComparisonGroupAReps, dashboardComparisonGroupBReps]);

  const dashboardTopProductComparisonRows = useMemo(() => {
    const aggregateGroupTopProducts = (reps: DashboardComparisonSalesRep[]) => {
      const byTopProduct = new Map<number, { topProductName: string; turnover: number }>();
      for (const rep of reps) {
        for (const item of rep.products) {
          const turnover = moneyToNumber(item.turnoverNetCzk);
          const current = byTopProduct.get(item.topProductId) ?? { topProductName: item.topProductName, turnover: 0 };
          current.turnover += turnover;
          byTopProduct.set(item.topProductId, current);
        }
      }
      const totalTurnover = [...byTopProduct.values()].reduce((sum, value) => sum + value.turnover, 0);
      return { byTopProduct, totalTurnover };
    };

    const groupA = aggregateGroupTopProducts(dashboardComparisonGroupAReps);
    const groupB = aggregateGroupTopProducts(dashboardComparisonGroupBReps);
    const topProductIds = new Set([...groupA.byTopProduct.keys(), ...groupB.byTopProduct.keys()]);

    return [...topProductIds]
      .map((topProductId) => {
        const groupAProduct = groupA.byTopProduct.get(topProductId);
        const groupBProduct = groupB.byTopProduct.get(topProductId);
        const groupATurnover = groupAProduct?.turnover ?? 0;
        const groupBTurnover = groupBProduct?.turnover ?? 0;

        return {
          topProductId,
          topProductName: groupAProduct?.topProductName ?? groupBProduct?.topProductName ?? `TOP product ${topProductId}`,
          totalTurnover: groupATurnover + groupBTurnover,
          groupA: groupAProduct
            ? {
                turnoverNetCzk: formatMoney(groupATurnover),
                sharePct: groupA.totalTurnover === 0 ? "0.00" : ((groupATurnover / groupA.totalTurnover) * 100).toFixed(2)
              }
            : null,
          groupB: groupBProduct
            ? {
                turnoverNetCzk: formatMoney(groupBTurnover),
                sharePct: groupB.totalTurnover === 0 ? "0.00" : ((groupBTurnover / groupB.totalTurnover) * 100).toFixed(2)
              }
            : null
        };
      })
      .sort((left, right) => right.totalTurnover - left.totalTurnover);
  }, [dashboardComparisonGroupAReps, dashboardComparisonGroupBReps]);

  const staffActiveSalesReps = useMemo(
    () => staffSalesReps.filter((rep) => rep.isActive).sort((left, right) => left.name.localeCompare(right.name)),
    [staffSalesReps]
  );

  const staffFilteredCustomers = useMemo(() => {
    const nameToken = staffCustomerNameFilter.trim().toLowerCase();
    return staffCustomers.filter((customer) => {
      if (nameToken && !customer.name.toLowerCase().includes(nameToken)) {
        return false;
      }

      if (!staffCustomerCurrentRepFilter) {
        return true;
      }

      if (staffCustomerCurrentRepFilter === "unassigned") {
        return customer.currentAssignment === null;
      }

      return String(customer.currentAssignment?.salesRepId ?? "") === staffCustomerCurrentRepFilter;
    });
  }, [staffCustomerCurrentRepFilter, staffCustomerNameFilter, staffCustomers]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [String(category.id), category] as const)),
    [categories]
  );

  const buildMergedCategorySuggestion = useCallback(
    (categoryAId: string, categoryBId: string) => {
      if (!categoryAId || !categoryBId || categoryAId === categoryBId) {
        return "";
      }
      const categoryA = categoryById.get(categoryAId);
      const categoryB = categoryById.get(categoryBId);
      if (!categoryA || !categoryB) {
        return "";
      }
      return `${categoryA.name} - ${categoryB.name}`;
    },
    [categoryById]
  );

  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: "contact_list", label: "contact list" },
    { id: "product_list", label: "product list" },
    { id: "order_list", label: "order list" },
    { id: "categories", label: "categories" },
    ...(isAdmin ? [{ id: "staff" as const, label: "staff" }] : []),
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

  const loadStaffData = async (accessToken: string) => {
    setStaffLoading(true);
    try {
      const [salesRepsResponse, customersResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/sales-reps`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        }),
        fetch(`${API_BASE_URL}/api/admin/customers`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
      ]);

      if (!salesRepsResponse.ok || !customersResponse.ok) {
        setStaffSalesReps([]);
        setStaffCustomers([]);
        const status = !salesRepsResponse.ok ? salesRepsResponse.status : customersResponse.status;
        setStaffMessage(`Staff load failed (${status}).`);
        return;
      }

      const salesRepsBody = (await salesRepsResponse.json()) as { salesReps: StaffSalesRepRow[] };
      const customersBody = (await customersResponse.json()) as { customers: StaffCustomerRow[] };
      setStaffSalesReps(salesRepsBody.salesReps);
      setStaffCustomers(customersBody.customers);
      setStaffMessage(`Loaded ${salesRepsBody.salesReps.length} sales reps and ${customersBody.customers.length} customers.`);

      setStaffSelectedCustomerIds((prev) => prev.filter((id) => customersBody.customers.some((customer) => customer.id === id)));
      if (staffEditSalesRepId && !salesRepsBody.salesReps.some((rep) => String(rep.id) === staffEditSalesRepId)) {
        setStaffEditSalesRepId("");
        setStaffEditName("");
        setStaffEditEmail("");
        setStaffEditPassword("");
      }
      if (staffAssignTargetSalesRepId && !salesRepsBody.salesReps.some((rep) => String(rep.id) === staffAssignTargetSalesRepId)) {
        setStaffAssignTargetSalesRepId("");
      }
    } catch {
      setStaffSalesReps([]);
      setStaffCustomers([]);
      setStaffMessage("Staff request failed.");
    } finally {
      setStaffLoading(false);
    }
  };

  const handleCreateStaffSalesRep = async () => {
    if (!token || !isAdmin) {
      return;
    }
    if (!staffCreateName.trim() || !staffCreateEmail.trim() || !staffCreatePassword.trim()) {
      setStaffMessage("Name, email and password are required.");
      return;
    }

    setStaffLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/sales-reps`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: staffCreateName.trim(),
          email: staffCreateEmail.trim().toLowerCase(),
          password: staffCreatePassword
        })
      });

      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setStaffMessage(body?.message ?? `Create sales rep failed (${response.status}).`);
        return;
      }

      setStaffCreateName("");
      setStaffCreateEmail("");
      setStaffCreatePassword("");
      setStaffMessage("Sales rep created.");
      await Promise.all([loadStaffData(token), loadMeta(token), loadDashboard(token)]);
    } catch {
      setStaffMessage("Create sales rep request failed.");
    } finally {
      setStaffLoading(false);
    }
  };

  const handleLoadSalesRepToEdit = (salesRepId: string) => {
    setStaffEditSalesRepId(salesRepId);
    const rep = staffSalesReps.find((row) => String(row.id) === salesRepId);
    if (!rep) {
      setStaffEditName("");
      setStaffEditEmail("");
      setStaffEditPassword("");
      return;
    }
    setStaffEditName(rep.name);
    setStaffEditEmail(rep.email);
    setStaffEditPassword("");
  };

  const handleUpdateStaffSalesRep = async () => {
    if (!token || !isAdmin) {
      return;
    }
    if (!staffEditSalesRepId) {
      setStaffMessage("Select a sales rep to edit.");
      return;
    }

    const selectedRep = staffSalesReps.find((rep) => String(rep.id) === staffEditSalesRepId);
    if (!selectedRep) {
      setStaffMessage("Selected sales rep no longer exists.");
      return;
    }

    const payload: Record<string, string> = {};
    if (staffEditName.trim() && staffEditName.trim() !== selectedRep.name) {
      payload.name = staffEditName.trim();
    }
    if (staffEditEmail.trim().toLowerCase() && staffEditEmail.trim().toLowerCase() !== selectedRep.email.toLowerCase()) {
      payload.email = staffEditEmail.trim().toLowerCase();
    }
    if (staffEditPassword.trim()) {
      payload.password = staffEditPassword.trim();
    }

    if (Object.keys(payload).length === 0) {
      setStaffMessage("No changes to save.");
      return;
    }

    setStaffLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/sales-reps/${selectedRep.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setStaffMessage(body?.message ?? `Update sales rep failed (${response.status}).`);
        return;
      }

      setStaffEditPassword("");
      setStaffMessage("Sales rep updated.");
      await Promise.all([loadStaffData(token), loadMeta(token), loadDashboard(token)]);
    } catch {
      setStaffMessage("Update sales rep request failed.");
    } finally {
      setStaffLoading(false);
    }
  };

  const handleDeactivateStaffSalesRep = async (rep: StaffSalesRepRow) => {
    if (!token || !isAdmin) {
      return;
    }

    const reassignToken = staffDeactivateTargetByRepId[rep.id]?.trim() ?? "";
    const payload = reassignToken ? { reassignToSalesRepId: Number.parseInt(reassignToken, 10) } : {};

    setStaffLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/sales-reps/${rep.id}/deactivate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setStaffMessage(body?.message ?? `Deactivate sales rep failed (${response.status}).`);
        return;
      }

      setStaffMessage(body?.message ?? "Sales rep deactivated.");
      await Promise.all([loadStaffData(token), loadMeta(token), loadContacts(token), loadDashboard(token)]);
    } catch {
      setStaffMessage("Deactivate sales rep request failed.");
    } finally {
      setStaffLoading(false);
    }
  };

  const handleReactivateStaffSalesRep = async (salesRepId: number) => {
    if (!token || !isAdmin) {
      return;
    }

    setStaffLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/sales-reps/${salesRepId}/reactivate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setStaffMessage(body?.message ?? `Reactivate sales rep failed (${response.status}).`);
        return;
      }

      setStaffMessage(body?.message ?? "Sales rep reactivated.");
      await Promise.all([loadStaffData(token), loadMeta(token), loadDashboard(token)]);
    } catch {
      setStaffMessage("Reactivate sales rep request failed.");
    } finally {
      setStaffLoading(false);
    }
  };

  const handleAssignSelectedCustomers = async () => {
    if (!token || !isAdmin) {
      return;
    }
    if (!staffAssignTargetSalesRepId) {
      setStaffMessage("Select target sales rep first.");
      return;
    }
    if (staffSelectedCustomerIds.length === 0) {
      setStaffMessage("Select at least one customer.");
      return;
    }

    setStaffLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/customers/assign-bulk`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          salesRepId: Number.parseInt(staffAssignTargetSalesRepId, 10),
          customerIds: staffSelectedCustomerIds
        })
      });

      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setStaffMessage(body?.message ?? `Customer assignment failed (${response.status}).`);
        return;
      }

      setStaffMessage(body?.message ?? "Customers assigned.");
      await Promise.all([loadStaffData(token), loadContacts(token), loadDashboard(token)]);
    } catch {
      setStaffMessage("Customer assignment request failed.");
    } finally {
      setStaffLoading(false);
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

    const orderStatuses = [...new Set(detail.orders.map((order) => order.status))].sort((left, right) => left.localeCompare(right));
    const orderStatusOptionsHtml = [
      `<option value="">all</option>`,
      ...orderStatuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`)
    ].join("");

    const ordersRowsHtml = detail.orders
      .map((order) => {
        return `<tr data-order-id="${order.id}" data-status="${escapeHtml(order.status)}"><td><a href="#" data-open-order-id="${order.id}">${escapeHtml(order.orderId)}</a></td><td>${escapeHtml(order.status)}</td><td>${escapeHtml(new Date(order.importedAt).toLocaleString())}</td><td>${escapeHtml(order.totals.allNetCzk)}</td><td>${order.totals.lineCount}</td></tr>`;
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
      <p>
        Status:
        <select id="orders-status-filter">
          ${orderStatusOptionsHtml}
        </select>
      </p>
      <table>
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Status</th>
            <th>Last change</th>
            <th>Total</th>
            <th>Products</th>
          </tr>
        </thead>
        <tbody id="orders-table-body">
          ${ordersRowsHtml || '<tr><td colspan="5">No orders.</td></tr>'}
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
  <script>
    (() => {
      const apiBaseUrl = ${JSON.stringify(API_BASE_URL)};
      const authToken = ${JSON.stringify(token)};

      const escapeHtml = (value) => value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

      const renderOrderWindow = (detail) => {
        const rowsHtml = (detail.products || []).map((line) => {
          const productName = escapeHtml(line.productName || "Unknown product");
          const sku = line.sku ? " (" + escapeHtml(line.sku) + ")" : "";
          const unitPrice = line.unitPriceFromProductNetCzk ? escapeHtml(line.unitPriceFromProductNetCzk) + " CZK" : "-";
          const qty = escapeHtml(String(line.quantity ?? ""));
          const lineTotal = line.lineTotalNetCzk ? escapeHtml(line.lineTotalNetCzk) + " CZK" : "-";
          return "<tr><td>" + productName + sku + "</td><td>" + unitPrice + "</td><td>" + qty + "</td><td>" + lineTotal + "</td></tr>";
        }).join("");

        return \`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Order \${escapeHtml(detail.order.orderId)}</title>
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
      <h1>Order \${escapeHtml(detail.order.orderId)}</h1>
      <p>Status: <strong>\${escapeHtml(detail.order.status)}</strong></p>
      <p>Customer: <strong>\${escapeHtml(detail.order.customer.name)}</strong></p>
      <p>Sales rep: <strong>\${escapeHtml((detail.order.currentSalesRep && detail.order.currentSalesRep.name) || "-")}</strong></p>
      <p>Last change: <strong>\${escapeHtml(new Date(detail.order.importedAt).toLocaleString())}</strong></p>
    </div>
    <div class="card">
      <h2>Products (\${(detail.products || []).length})</h2>
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
          \${rowsHtml || '<tr><td colspan="4">No product lines in this order.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>\`;
      };

      const openOrderById = async (orderDbId) => {
        if (window.opener && typeof window.opener.crmOpenOrderWindowById === "function") {
          window.opener.crmOpenOrderWindowById(orderDbId);
          return;
        }

        const popup = window.open("", "_blank", "width=1080,height=760");
        if (!popup) {
          alert("Popup blocked. Please allow popups for this app.");
          return;
        }

        popup.document.open();
        popup.document.write("<!doctype html><html><head><meta charset='utf-8'><title>Order</title></head><body style='font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f6f8fc;color:#1f2937'><h2>Loading order...</h2></body></html>");
        popup.document.close();

        try {
          const response = await fetch(apiBaseUrl + "/api/workspace/orders/" + orderDbId, {
            headers: {
              Authorization: "Bearer " + authToken
            }
          });

          if (!response.ok) {
            popup.document.open();
            popup.document.write("<!doctype html><html><head><meta charset='utf-8'><title>Order</title></head><body style='font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f6f8fc;color:#1f2937'><h2>Order detail is not available.</h2></body></html>");
            popup.document.close();
            return;
          }

          const detail = await response.json();
          popup.document.open();
          popup.document.write(renderOrderWindow(detail));
          popup.document.close();
        } catch {
          popup.document.open();
          popup.document.write("<!doctype html><html><head><meta charset='utf-8'><title>Order</title></head><body style='font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f6f8fc;color:#1f2937'><h2>Order detail request failed.</h2></body></html>");
          popup.document.close();
        }
      };

      document.querySelectorAll("[data-open-order-id]").forEach((anchor) => {
        anchor.addEventListener("click", (event) => {
          event.preventDefault();
          const orderDbId = Number(anchor.getAttribute("data-open-order-id"));
          if (!Number.isFinite(orderDbId)) {
            return;
          }
          void openOrderById(orderDbId);
        });
      });

      const statusFilter = document.getElementById("orders-status-filter");
      const orderRows = Array.from(document.querySelectorAll("#orders-table-body tr[data-order-id]"));

      if (statusFilter) {
        statusFilter.addEventListener("change", () => {
          const selected = statusFilter.value;
          orderRows.forEach((row) => {
            const rowStatus = row.getAttribute("data-status") || "";
            row.style.display = !selected || selected === rowStatus ? "" : "none";
          });
        });
      }
    })();
  </script>
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

    const loadingHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(categoryName)}</title></head><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f6f8fc;color:#1f2937"><h2>Loading ${escapeHtml(categoryName)}...</h2></body></html>`;
    categoryWindow.document.open();
    categoryWindow.document.write(loadingHtml);
    categoryWindow.document.close();

    try {
      const query = new URLSearchParams();
      query.set("category", categoryName);
      query.set("isActive", "true");
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
          const name = escapeHtml(product.name);
          const sku = escapeHtml(product.sku ?? "-");
          const sales = escapeHtml(product.turnoverNetCzk);
          const unitPrice = escapeHtml(formatMoneyOrDash(product.unitPriceNetCzk));
          const topList = escapeHtml(String(product.isActive));
          const stock = escapeHtml(formatNumberOrDash(product.stockQuantity));
          const historicalSales = escapeHtml(formatNumberOrDash(product.historicalSalesQty));
          const incoming = escapeHtml(formatNumberOrDash(product.incomingFromSupplierQty));
          return `<tr><td><a href="#" data-product-name="${name}" data-product-sku="${sku}" data-product-sales="${sales}" data-product-unit-price="${unitPrice}" data-product-stock="${stock}" data-product-historical-sales="${historicalSales}" data-product-incoming="${incoming}" data-product-top-list="${topList}">${name}</a></td><td>${sku}</td><td>${sales}</td><td>${unitPrice}</td><td>${topList}</td></tr>`;
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
      <h1>${escapeHtml(categoryName)} (${body.summary.count} products)</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>SKU</th>
            <th>Sales CZK</th>
            <th>Unit price</th>
            <th>In TOP list</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="5">No products in this category.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
  <script>
    (() => {
      const escapeHtml = (value) => value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

      const openProductPopup = (name, sku, sales, unitPrice, stock, historicalSales, incoming, topList) => {
        const popup = window.open("", "_blank", "width=740,height=520");
        if (!popup) {
          alert("Popup blocked. Please allow popups for this app.");
          return;
        }

        popup.document.open();
        popup.document.write(\`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Product \${escapeHtml(name)}</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;margin:0;background:#eef2f7;color:#1d2a3a}
    .wrap{max-width:760px;margin:0 auto;padding:24px}
    .card{background:#fff;border:1px solid #d6dbe7;border-radius:12px;padding:16px}
    h1{margin:0 0 12px;font-size:28px}
    p{margin:8px 0}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>\${escapeHtml(name)}</h1>
      <p>SKU: <strong>\${escapeHtml(sku)}</strong></p>
      <p>Sales CZK: <strong>\${escapeHtml(sales)}</strong></p>
      <p>Unit price: <strong>\${escapeHtml(unitPrice)}</strong></p>
      <p>Stock: <strong>\${escapeHtml(stock)}</strong> | Historical sales: <strong>\${escapeHtml(historicalSales)}</strong> | Incoming: <strong>\${escapeHtml(incoming)}</strong></p>
      \${topList === "true" ? "<p>In TOP list: <strong>true</strong></p>" : ""}
    </div>
  </div>
</body>
</html>\`);
        popup.document.close();
      };

      document.querySelectorAll("[data-product-name]").forEach((anchor) => {
        anchor.style.cursor = "pointer";
        anchor.style.textDecoration = "underline";
        anchor.addEventListener("click", (event) => {
          event.preventDefault();
          const name = anchor.getAttribute("data-product-name") || "";
          const sku = anchor.getAttribute("data-product-sku") || "-";
          const sales = anchor.getAttribute("data-product-sales") || "0.00";
          const unitPrice = anchor.getAttribute("data-product-unit-price") || "-";
          const stock = anchor.getAttribute("data-product-stock") || "-";
          const historicalSales = anchor.getAttribute("data-product-historical-sales") || "-";
          const incoming = anchor.getAttribute("data-product-incoming") || "-";
          const topList = anchor.getAttribute("data-product-top-list") || "false";
          openProductPopup(name, sku, sales, unitPrice, stock, historicalSales, incoming, topList);
        });
      });
    })();
  </script>
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

  const loadOrderDetail = useCallback(async (accessToken: string, orderDbId: number): Promise<OrderDetailResponse | null> => {
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
  }, []);

  const buildOrderWindowHtml = useCallback(
    (detail: OrderDetailResponse): string => {
      const rowsHtml = detail.products
        .map((line) => {
          const productName = escapeHtml(line.productName);
          const skuValue = escapeHtml(line.sku ?? "-");
          const skuLabel = line.sku ? ` (${escapeHtml(line.sku)})` : "";
          const unitPrice = line.unitPriceFromProductNetCzk ? `${escapeHtml(line.unitPriceFromProductNetCzk)} CZK` : "-";
          const qty = escapeHtml(line.quantity);
          const lineTotal = line.lineTotalNetCzk ? `${escapeHtml(line.lineTotalNetCzk)} CZK` : "-";
          return `<tr><td><a href="#" data-product-name="${productName}" data-product-sku="${skuValue}" data-product-unit-price="${unitPrice}">${productName}${skuLabel}</a></td><td>${unitPrice}</td><td>${qty}</td><td>${lineTotal}</td></tr>`;
        })
        .join("");

      return `<!doctype html>
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
  <script>
    (() => {
      const apiBaseUrl = ${JSON.stringify(API_BASE_URL)};
      const authToken = ${JSON.stringify(token ?? "")};

      const escapeHtml = (value) => value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

      const openProductPopup = (name, sku, sales, unitPrice, stock, historicalSales, incoming, topList) => {
        const popup = window.open("", "_blank", "width=740,height=520");
        if (!popup) {
          alert("Popup blocked. Please allow popups for this app.");
          return;
        }

        popup.document.open();
        popup.document.write(\`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Product \${escapeHtml(name)}</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;margin:0;background:#eef2f7;color:#1d2a3a}
    .wrap{max-width:760px;margin:0 auto;padding:24px}
    .card{background:#fff;border:1px solid #d6dbe7;border-radius:12px;padding:16px}
    h1{margin:0 0 12px;font-size:28px}
    p{margin:8px 0}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>\${escapeHtml(name)}</h1>
      <p>SKU: <strong>\${escapeHtml(sku)}</strong></p>
      <p>Sales CZK: <strong>\${escapeHtml(sales)}</strong></p>
      <p>Unit price: <strong>\${escapeHtml(unitPrice)}</strong></p>
      <p>Stock: <strong>\${escapeHtml(stock)}</strong> | Historical sales: <strong>\${escapeHtml(historicalSales)}</strong> | Incoming: <strong>\${escapeHtml(incoming)}</strong></p>
      \${topList === "true" ? "<p>In TOP list: <strong>true</strong></p>" : ""}
    </div>
  </div>
</body>
</html>\`);
        popup.document.close();
      };

      const formatNumberOrDash = (value) => (value === null || value === undefined ? "-" : String(value));

      const loadProductInfo = async (name, sku, fallbackUnitPrice) => {
        if (!authToken) {
          return {
            sales: "-",
            unitPrice: fallbackUnitPrice,
            stock: "-",
            historicalSales: "-",
            incoming: "-",
            topList: "false"
          };
        }

        try {
          const query = new URLSearchParams();
          if (sku && sku !== "-") {
            query.set("sku", sku);
          } else if (name) {
            query.set("name", name);
          }
          query.set("isActive", "any");
          query.set("limit", "20");

          const response = await fetch(apiBaseUrl + "/api/workspace/products?" + query.toString(), {
            headers: {
              Authorization: "Bearer " + authToken
            }
          });

          if (!response.ok) {
            throw new Error("Product detail failed.");
          }

          const body = await response.json();
          const productList = Array.isArray(body.products) ? body.products : [];
          const skuToken = String(sku || "").trim().toLowerCase();
          const nameToken = String(name || "").trim().toLowerCase();

          const matchBySku = skuToken
            ? productList.find((item) => String(item.sku || "").trim().toLowerCase() === skuToken)
            : null;
          const matchByName = nameToken
            ? productList.find((item) => String(item.name || "").trim().toLowerCase() === nameToken)
            : null;
          const product = matchBySku || matchByName || productList[0] || null;

          return {
            sales: product ? String(product.turnoverNetCzk || "-") : "-",
            unitPrice: product && product.unitPriceNetCzk ? String(product.unitPriceNetCzk) + " CZK" : fallbackUnitPrice,
            stock: formatNumberOrDash(product ? product.stockQuantity : null),
            historicalSales: formatNumberOrDash(product ? product.historicalSalesQty : null),
            incoming: formatNumberOrDash(product ? product.incomingFromSupplierQty : null),
            topList: product && product.isActive === true ? "true" : "false"
          };
        } catch {
          return {
            sales: "-",
            unitPrice: fallbackUnitPrice,
            stock: "-",
            historicalSales: "-",
            incoming: "-",
            topList: "false"
          };
        }
      };

      document.querySelectorAll("[data-product-name]").forEach((anchor) => {
        anchor.style.cursor = "pointer";
        anchor.style.textDecoration = "underline";
        anchor.addEventListener("click", (event) => {
          event.preventDefault();
          const name = anchor.getAttribute("data-product-name") || "";
          const sku = anchor.getAttribute("data-product-sku") || "-";
          const fallbackUnitPrice = anchor.getAttribute("data-product-unit-price") || "-";
          void loadProductInfo(name, sku, fallbackUnitPrice).then((productInfo) => {
            openProductPopup(
              name,
              sku,
              productInfo.sales,
              productInfo.unitPrice,
              productInfo.stock,
              productInfo.historicalSales,
              productInfo.incoming,
              productInfo.topList
            );
          });
        });
      });
    })();
  </script>
</body>
</html>`;
    },
    [escapeHtml, token]
  );

  const handleOpenOrderWindowById = useCallback(async (orderDbId: number, orderLabel?: string) => {
    if (!token) {
      return;
    }

    const orderWindow = window.open("", "_blank", "width=1080,height=760");
    if (!orderWindow) {
      setOrderMessage("Popup blocked. Please allow popups for this app.");
      return;
    }

    const orderLabelSafe = escapeHtml(orderLabel ?? `#${orderDbId}`);
    const loadingHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Order ${orderLabelSafe}</title></head><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f6f8fc;color:#1f2937"><h2>Loading order ${orderLabelSafe}...</h2></body></html>`;
    orderWindow.document.open();
    orderWindow.document.write(loadingHtml);
    orderWindow.document.close();

    const detail = orderDetailsById[orderDbId] ?? (await loadOrderDetail(token, orderDbId));

    if (!detail) {
      const failHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Order ${orderLabelSafe}</title></head><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f6f8fc;color:#1f2937"><h2>Order detail is not available.</h2><p>Please close this window and try again.</p></body></html>`;
      orderWindow.document.open();
      orderWindow.document.write(failHtml);
      orderWindow.document.close();
      return;
    }

    const fullHtml = buildOrderWindowHtml(detail);
    orderWindow.document.open();
    orderWindow.document.write(fullHtml);
    orderWindow.document.close();
  }, [buildOrderWindowHtml, escapeHtml, loadOrderDetail, orderDetailsById, token]);

  const handleOpenOrderWindow = async (order: OrderRow) => {
    await handleOpenOrderWindowById(order.id, order.orderId);
  };

  useEffect(() => {
    const hostWindow = window as CrmWindowWithOrderOpener;
    hostWindow.crmOpenOrderWindowById = (orderDbId: number) => {
      void handleOpenOrderWindowById(orderDbId);
    };

    return () => {
      delete hostWindow.crmOpenOrderWindowById;
    };
  }, [handleOpenOrderWindowById]);

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
      setMergeCategoryAId((prev) => (body.categories.some((category) => String(category.id) === prev) ? prev : ""));
      setMergeCategoryBId((prev) => (body.categories.some((category) => String(category.id) === prev) ? prev : ""));
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
    setDashboardComparisonDialogOpen(false);
    setDashboardComparisonGroupAIds([]);
    setDashboardComparisonGroupBIds([]);
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

  const downloadImportTemplate = (kind: ImportKind) => {
    const template = IMPORT_TEMPLATES[kind];
    const blob = new Blob([template.xml], { type: "application/xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = template.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  };

  const handleImportFromFile = async (kind: ImportKind, file: File | null) => {
    if (!token) {
      return;
    }
    if (!file) {
      if (kind === "customers") {
        setContactMessage("Please choose an XML file first.");
      } else if (kind === "products") {
        setProductMessage("Please choose an XML file first.");
      } else {
        setOrderMessage("Please choose an XML file first.");
      }
      return;
    }

    const setLoadingByKind = (isLoading: boolean) => {
      if (kind === "customers") {
        setCustomerImportLoading(isLoading);
      } else if (kind === "products") {
        setProductImportLoading(isLoading);
      } else {
        setOrderImportLoading(isLoading);
      }
    };

    const setFileByKind = (nextFile: File | null) => {
      if (kind === "customers") {
        setCustomerImportFile(nextFile);
      } else if (kind === "products") {
        setProductImportFile(nextFile);
      } else {
        setOrderImportFile(nextFile);
      }
    };

    const setMessageByKind = (message: string) => {
      if (kind === "customers") {
        setContactMessage(message);
      } else if (kind === "products") {
        setProductMessage(message);
      } else {
        setOrderMessage(message);
      }
    };

    const endpointByKind: Record<ImportKind, string> = {
      customers: "customers",
      products: "products",
      orders: "orders"
    };

    setLoadingByKind(true);
    setMessageByKind(`Importing ${kind} from ${file.name}...`);

    try {
      const xml = await file.text();
      if (!xml.trim()) {
        setMessageByKind("Selected file is empty.");
        return;
      }

      const apiBaseTrimmed = API_BASE_URL.replace(/\/+$/, "");
      const importRoute = `/admin/imports/${endpointByKind[kind]}/xml`;
      const importUrlCandidates = [`${apiBaseTrimmed}/api${importRoute}`, `${apiBaseTrimmed}${importRoute}`];
      let response: Response | null = null;
      let attemptedUrl = importUrlCandidates[0];

      for (const url of importUrlCandidates) {
        attemptedUrl = url;
        const candidateResponse = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            xml,
            sourceName: `manual-file-${kind}-${file.name}`
          })
        });
        response = candidateResponse;
        if (candidateResponse.status !== 404) {
          break;
        }
      }

      if (!response) {
        setMessageByKind("Import request failed.");
        return;
      }

      const body = (await response.json().catch(() => null)) as ImportResponse | null;
      if (!response.ok) {
        if (response.status === 404) {
          setMessageByKind(`Import failed (404). Endpoint not found: ${attemptedUrl}`);
          return;
        }
        setMessageByKind(body?.message ?? `Import failed (${response.status}).`);
        return;
      }

      const runSummary = body?.run
        ? ` total=${body.run.totalRecords}, created=${body.run.createdOrders}, updated=${body.run.updatedOrders}, errors=${body.run.errorRecords}`
        : "";
      const sampleError = body?.errors && body.errors.length > 0 ? ` First error: row ${body.errors[0].recordIndex} - ${body.errors[0].message}` : "";
      setMessageByKind(`${body?.message ?? "Import completed."}${runSummary}.${sampleError}`.trim());

      if (kind === "customers") {
        await loadContacts(token);
      } else if (kind === "products") {
        await loadProducts(token);
        await loadTopProducts(token);
        await loadCategories(token);
      } else {
        await loadOrders(token);
        await loadMeta(token);
      }

      setFileByKind(null);
    } catch {
      setMessageByKind("Import request failed.");
    } finally {
      setLoadingByKind(false);
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

  const handleDeleteCategory = async (category: CategoryRow) => {
    if (!token || !isAdmin) {
      return;
    }

    const confirmed = window.confirm(`Do you really want to delete category "${category.name}"?`);
    if (!confirmed) {
      return;
    }

    setCategoriesLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/workspace/categories/${category.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const body = (await response.json().catch(() => null)) as { message?: string; clearedTopProducts?: number } | null;
      if (!response.ok) {
        setCategoriesMessage(body?.message ?? `Delete category failed (${response.status}).`);
        return;
      }

      const clearedInfo =
        typeof body?.clearedTopProducts === "number"
          ? ` ${body.clearedTopProducts} TOP products were unassigned from this category.`
          : "";
      setCategoriesMessage(`${body?.message ?? "Category deleted."}${clearedInfo}`);
      await loadCategories(token);
      await loadMeta(token);
      await loadTopProducts(token);
    } catch {
      setCategoriesMessage("Delete category request failed.");
    } finally {
      setCategoriesLoading(false);
    }
  };

  const handleMergeCategories = async () => {
    if (!token || !isAdmin) {
      return;
    }

    if (!mergeCategoryAId || !mergeCategoryBId) {
      setCategoriesMessage("Select 2 categories to merge.");
      return;
    }
    if (mergeCategoryAId === mergeCategoryBId) {
      setCategoriesMessage("Select two different categories.");
      return;
    }
    if (!mergeCategoryName.trim()) {
      setCategoriesMessage("Merged category name is required.");
      return;
    }

    setCategoriesLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/workspace/categories/merge`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceCategoryIdA: Number.parseInt(mergeCategoryAId, 10),
          sourceCategoryIdB: Number.parseInt(mergeCategoryBId, 10),
          mergedCategoryName: mergeCategoryName.trim()
        })
      });

      const body = (await response.json().catch(() => null)) as
        | { message?: string; topProductsUpdated?: number; orderItemsUpdated?: number }
        | null;
      if (!response.ok) {
        setCategoriesMessage(body?.message ?? `Merge categories failed (${response.status}).`);
        return;
      }

      setCategoriesMessage(
        `${body?.message ?? "Categories merged."} TOP products updated: ${body?.topProductsUpdated ?? 0}, order items updated: ${
          body?.orderItemsUpdated ?? 0
        }.`
      );
      setMergeCategoryAId("");
      setMergeCategoryBId("");
      setMergeCategoryName("");
      await loadCategories(token);
      await loadMeta(token);
      await loadTopProducts(token);
      await loadDashboard(token);
    } catch {
      setCategoriesMessage("Merge categories request failed.");
    } finally {
      setCategoriesLoading(false);
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
      setTopProducts((prev) => prev.map((item) => (item.id === topProductId ? { ...item, isActive: !isActive } : item)));
      setProducts((prev) => prev.map((item) => (item.id === topProductId ? { ...item, isActive: !isActive } : item)));
      void loadCategories(token);
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
      if (body.user.role === "admin") {
        await loadStaffData(body.accessToken);
      } else {
        setStaffSalesReps([]);
        setStaffCustomers([]);
      }
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
    setDashboardComparisonDialogOpen(false);
    setDashboardComparisonGroupAIds([]);
    setDashboardComparisonGroupBIds([]);
    setCustomerImportFile(null);
    setProductImportFile(null);
    setOrderImportFile(null);
    setCustomerImportLoading(false);
    setProductImportLoading(false);
    setOrderImportLoading(false);
    setMergeCategoryAId("");
    setMergeCategoryBId("");
    setMergeCategoryName("");
    setStaffSalesReps([]);
    setStaffCustomers([]);
    setStaffMessage("Staff not loaded yet.");
    setStaffCreateName("");
    setStaffCreateEmail("");
    setStaffCreatePassword("");
    setStaffEditSalesRepId("");
    setStaffEditName("");
    setStaffEditEmail("");
    setStaffEditPassword("");
    setStaffDeactivateTargetByRepId({});
    setStaffCustomerNameFilter("");
    setStaffCustomerCurrentRepFilter("");
    setStaffSelectedCustomerIds([]);
    setStaffAssignTargetSalesRepId("");
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
              onClick={() => {
                setActiveTab(tab.id);
                setDashboardComparisonDialogOpen(false);
              }}
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
                onClick={() => {
                  setActiveTab(tab.id);
                  setDashboardComparisonDialogOpen(false);
                }}
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
                {isAdmin && (
                  <div className="import-box">
                    <h3>Customer import</h3>
                    <div className="import-actions">
                      <button type="button" onClick={() => downloadImportTemplate("customers")} disabled={customerImportLoading}>
                        Download XML template
                      </button>
                      <label className="file-picker">
                        <span>Choose XML file</span>
                        <input
                          type="file"
                          accept=".xml,text/xml,application/xml"
                          onChange={(event) => {
                            setCustomerImportFile(event.target.files?.[0] ?? null);
                          }}
                          disabled={customerImportLoading}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => handleImportFromFile("customers", customerImportFile)}
                        disabled={customerImportLoading}
                      >
                        {customerImportLoading ? "Importing..." : "Import customers"}
                      </button>
                    </div>
                    <p className="hint">{customerImportFile ? `Selected file: ${customerImportFile.name}` : "No file selected yet."}</p>
                  </div>
                )}
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
                {isAdmin && (
                  <div className="import-box">
                    <h3>Product import</h3>
                    <div className="import-actions">
                      <button type="button" onClick={() => downloadImportTemplate("products")} disabled={productImportLoading}>
                        Download XML template
                      </button>
                      <label className="file-picker">
                        <span>Choose XML file</span>
                        <input
                          type="file"
                          accept=".xml,text/xml,application/xml"
                          onChange={(event) => {
                            setProductImportFile(event.target.files?.[0] ?? null);
                          }}
                          disabled={productImportLoading}
                        />
                      </label>
                      <button type="button" onClick={() => handleImportFromFile("products", productImportFile)} disabled={productImportLoading}>
                        {productImportLoading ? "Importing..." : "Import products"}
                      </button>
                    </div>
                    <p className="hint">{productImportFile ? `Selected file: ${productImportFile.name}` : "No file selected yet."}</p>
                  </div>
                )}
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
                        Category: <strong>{product.categoryName ?? "-"}</strong>
                      </p>
                      <p>
                        Sales: <strong>{product.turnoverNetCzk} CZK</strong>
                      </p>
                      <p>
                        Unit price: <strong>{formatMoneyOrDash(product.unitPriceNetCzk)}</strong>
                      </p>
                      <p>
                        Stock: <strong>{formatNumberOrDash(product.stockQuantity)}</strong> | Historical sales:{" "}
                        <strong>{formatNumberOrDash(product.historicalSalesQty)}</strong> | Incoming:{" "}
                        <strong>{formatNumberOrDash(product.incomingFromSupplierQty)}</strong>
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
                {isAdmin && (
                  <div className="import-box">
                    <h3>Order import</h3>
                    <div className="import-actions">
                      <button type="button" onClick={() => downloadImportTemplate("orders")} disabled={orderImportLoading}>
                        Download XML template
                      </button>
                      <label className="file-picker">
                        <span>Choose XML file</span>
                        <input
                          type="file"
                          accept=".xml,text/xml,application/xml"
                          onChange={(event) => {
                            setOrderImportFile(event.target.files?.[0] ?? null);
                          }}
                          disabled={orderImportLoading}
                        />
                      </label>
                      <button type="button" onClick={() => handleImportFromFile("orders", orderImportFile)} disabled={orderImportLoading}>
                        {orderImportLoading ? "Importing..." : "Import orders"}
                      </button>
                    </div>
                    <p className="hint">{orderImportFile ? `Selected file: ${orderImportFile.name}` : "No file selected yet."}</p>
                  </div>
                )}
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
                          <button
                            type="button"
                            className="inline-link-btn"
                            onClick={() => handleOpenOrderWindow(order)}
                            disabled={detailLoading}
                          >
                            {order.orderId}
                          </button>{" "}
                          | {order.status}
                        </h3>
                        <p>
                          Customer: <strong>{order.customer.name}</strong> | Rep: <strong>{order.currentSalesRep?.name ?? "-"}</strong>
                        </p>
                        <p>
                          Product: <strong>{order.totals.productNetCzk}</strong> | Total: <strong>{order.totals.allNetCzk}</strong> CZK
                        </p>
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
                    <div className="merge-box">
                      <h3>Merge categories</h3>
                      <label>
                        Category 1
                        <select
                          value={mergeCategoryAId}
                          onChange={(event) => {
                            const nextAId = event.target.value;
                            setMergeCategoryAId(nextAId);
                            const suggestion = buildMergedCategorySuggestion(nextAId, mergeCategoryBId);
                            if (suggestion) {
                              setMergeCategoryName(suggestion);
                            }
                          }}
                        >
                          <option value="">Select category</option>
                          {categories.map((category) => (
                            <option key={`merge-a-${category.id}`} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Category 2
                        <select
                          value={mergeCategoryBId}
                          onChange={(event) => {
                            const nextBId = event.target.value;
                            setMergeCategoryBId(nextBId);
                            const suggestion = buildMergedCategorySuggestion(mergeCategoryAId, nextBId);
                            if (suggestion) {
                              setMergeCategoryName(suggestion);
                            }
                          }}
                        >
                          <option value="">Select category</option>
                          {categories.map((category) => (
                            <option key={`merge-b-${category.id}`} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        New merged category name
                        <input
                          value={mergeCategoryName}
                          onChange={(event) => setMergeCategoryName(event.target.value)}
                          placeholder={buildMergedCategorySuggestion(mergeCategoryAId, mergeCategoryBId) || "Category A - Category B"}
                        />
                      </label>
                      <button type="button" onClick={handleMergeCategories} disabled={categoriesLoading}>
                        Merge categories
                      </button>
                    </div>
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
                      {isAdmin && (
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => handleDeleteCategory(category)}
                          disabled={categoriesLoading}
                        >
                          Delete category
                        </button>
                      )}
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
                      <button type="button" onClick={() => handleToggleTopProduct(item.id, item.isActive)}>
                        {item.isActive ? "Remove from TOP list" : "Add to TOP list"}
                      </button>
                    </article>
                  ))}
                </div>
              </article>
            </div>
          )}

          {activeTab === "staff" && isAdmin && (
            <div className="workspace-grid">
              <article className="panel">
                <h2>Staff controls</h2>
                <button type="button" onClick={() => token && loadStaffData(token)} disabled={staffLoading}>
                  {staffLoading ? "Loading..." : "Refresh staff data"}
                </button>

                <h3>Create salesman</h3>
                <label>
                  Name
                  <input value={staffCreateName} onChange={(event) => setStaffCreateName(event.target.value)} />
                </label>
                <label>
                  Email
                  <input value={staffCreateEmail} onChange={(event) => setStaffCreateEmail(event.target.value)} />
                </label>
                <label>
                  Password
                  <input type="password" value={staffCreatePassword} onChange={(event) => setStaffCreatePassword(event.target.value)} />
                </label>
                <button type="button" onClick={handleCreateStaffSalesRep} disabled={staffLoading}>
                  Create salesman
                </button>

                <h3>Edit salesman</h3>
                <label>
                  Select salesman
                  <select value={staffEditSalesRepId} onChange={(event) => handleLoadSalesRepToEdit(event.target.value)}>
                    <option value="">Select</option>
                    {staffSalesReps.map((rep) => (
                      <option key={`edit-rep-${rep.id}`} value={rep.id}>
                        {rep.name} ({rep.isActive ? "active" : "inactive"})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Name
                  <input value={staffEditName} onChange={(event) => setStaffEditName(event.target.value)} />
                </label>
                <label>
                  Email
                  <input value={staffEditEmail} onChange={(event) => setStaffEditEmail(event.target.value)} />
                </label>
                <label>
                  New password (optional)
                  <input type="password" value={staffEditPassword} onChange={(event) => setStaffEditPassword(event.target.value)} />
                </label>
                <button type="button" onClick={handleUpdateStaffSalesRep} disabled={staffLoading || !staffEditSalesRepId}>
                  Save salesman
                </button>
                <p className="message">{staffMessage}</p>
              </article>

              <article className="panel">
                <h2>Salesmen ({staffSalesReps.length})</h2>
                <div className="customer-list">
                  {staffSalesReps.map((rep) => (
                    <article className="customer-card" key={`staff-rep-${rep.id}`}>
                      <h3>{rep.name}</h3>
                      <p>
                        Email: <strong>{rep.email}</strong>
                      </p>
                      <p>
                        Status: <strong>{rep.isActive ? "active" : "inactive"}</strong>
                      </p>
                      <p>
                        Active customers: <strong>{rep.activeCustomerCount}</strong>
                      </p>
                      <p>
                        Created: <strong>{new Date(rep.createdAt).toLocaleDateString()}</strong>
                      </p>

                      <div className="actions">
                        <button type="button" onClick={() => handleLoadSalesRepToEdit(String(rep.id))} disabled={staffLoading}>
                          Edit
                        </button>
                        {rep.isActive ? (
                          <>
                            <select
                              value={staffDeactivateTargetByRepId[rep.id] ?? ""}
                              onChange={(event) =>
                                setStaffDeactivateTargetByRepId((prev) => ({
                                  ...prev,
                                  [rep.id]: event.target.value
                                }))
                              }
                              disabled={staffLoading}
                            >
                              <option value="">Deactivate without reassignment</option>
                              {staffActiveSalesReps
                                .filter((candidate) => candidate.id !== rep.id)
                                .map((candidate) => (
                                  <option key={`deactivate-target-${rep.id}-${candidate.id}`} value={candidate.id}>
                                    Reassign to {candidate.name}
                                  </option>
                                ))}
                            </select>
                            <button type="button" onClick={() => handleDeactivateStaffSalesRep(rep)} disabled={staffLoading}>
                              Cancel salesman
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => handleReactivateStaffSalesRep(rep.id)} disabled={staffLoading}>
                            Reactivate
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </article>

              <article className="panel">
                <h2>Assign customers</h2>
                <label>
                  Filter by customer name
                  <input value={staffCustomerNameFilter} onChange={(event) => setStaffCustomerNameFilter(event.target.value)} />
                </label>
                <label>
                  Filter by current salesman
                  <select value={staffCustomerCurrentRepFilter} onChange={(event) => setStaffCustomerCurrentRepFilter(event.target.value)}>
                    <option value="">All</option>
                    <option value="unassigned">Unassigned</option>
                    {staffSalesReps.map((rep) => (
                      <option key={`staff-current-rep-filter-${rep.id}`} value={rep.id}>
                        {rep.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Assign selected customers to
                  <select value={staffAssignTargetSalesRepId} onChange={(event) => setStaffAssignTargetSalesRepId(event.target.value)}>
                    <option value="">Select active salesman</option>
                    {staffActiveSalesReps.map((rep) => (
                      <option key={`assign-target-${rep.id}`} value={rep.id}>
                        {rep.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="actions">
                  <button
                    type="button"
                    onClick={() =>
                      setStaffSelectedCustomerIds((prev) => [
                        ...new Set([...prev, ...staffFilteredCustomers.map((customer) => customer.id)])
                      ])
                    }
                    disabled={staffFilteredCustomers.length === 0}
                  >
                    Select filtered
                  </button>
                  <button type="button" onClick={() => setStaffSelectedCustomerIds([])} disabled={staffSelectedCustomerIds.length === 0}>
                    Clear selection
                  </button>
                  <button
                    type="button"
                    onClick={handleAssignSelectedCustomers}
                    disabled={staffLoading || !staffAssignTargetSalesRepId || staffSelectedCustomerIds.length === 0}
                  >
                    Assign selected ({staffSelectedCustomerIds.length})
                  </button>
                </div>

                <div className="multi-checklist staff-customer-checklist">
                  {staffFilteredCustomers.map((customer) => {
                    const checked = staffSelectedCustomerIds.includes(customer.id);
                    const currentRep = customer.currentAssignment?.salesRep.name ?? "Unassigned";
                    return (
                      <label key={`staff-customer-${customer.id}`} className="inline-check">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setStaffSelectedCustomerIds((prev) => {
                              if (event.target.checked) {
                                return [...prev, customer.id];
                              }
                              return prev.filter((id) => id !== customer.id);
                            });
                          }}
                        />
                        <span>
                          {customer.name} ({currentRep})
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="hint">
                  Showing {staffFilteredCustomers.length} of {staffCustomers.length} customers.
                </p>
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
                {isAdmin && (
                  <button
                    type="button"
                    onClick={openDashboardComparisonDialog}
                    disabled={!dashboard || dashboardSalesRepOptions.length === 0}
                  >
                    Compare merchants
                  </button>
                )}
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
          {activeTab === "dashboard" && isAdmin && dashboardComparisonDialogOpen && dashboard && (
            <div className="dialog-backdrop" role="presentation" onClick={() => setDashboardComparisonDialogOpen(false)}>
              <section
                className="dialog-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="merchant-compare-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="dialog-head">
                  <h2 id="merchant-compare-title">Merchant comparison</h2>
                  <button type="button" className="dialog-close-btn" onClick={() => setDashboardComparisonDialogOpen(false)}>
                    Close
                  </button>
                </div>
                <div className="comparison-selector-grid">
                  <article className="comparison-filter-panel">
                    <h3>Group A (left)</h3>
                    <div className="multi-checklist">
                      {dashboardSalesRepOptions.map((rep) => (
                        <label key={`group-a-salesman-${rep.id}`} className="inline-check">
                          <input
                            type="checkbox"
                            checked={dashboardComparisonGroupAIds.includes(rep.id)}
                            onChange={(event) => {
                              setDashboardComparisonGroupAIds((prev) => {
                                const nextSet = new Set(prev);
                                if (event.target.checked) {
                                  nextSet.add(rep.id);
                                } else {
                                  nextSet.delete(rep.id);
                                }
                                return orderDashboardSalesRepIds(nextSet);
                              });
                            }}
                          />
                          {rep.name}
                        </label>
                      ))}
                    </div>
                    <div className="actions">
                      <button
                        type="button"
                        onClick={() => setDashboardComparisonGroupAIds(dashboardSalesRepOptions.map((option) => option.id))}
                        disabled={dashboardComparisonGroupAIds.length === dashboardSalesRepOptions.length}
                      >
                        Select all A
                      </button>
                      <button
                        type="button"
                        onClick={() => setDashboardComparisonGroupAIds([])}
                        disabled={dashboardComparisonGroupAIds.length === 0}
                      >
                        Clear A
                      </button>
                    </div>
                  </article>

                  <article className="comparison-filter-panel">
                    <h3>Group B (right)</h3>
                    <div className="multi-checklist">
                      {dashboardSalesRepOptions.map((rep) => (
                        <label key={`group-b-salesman-${rep.id}`} className="inline-check">
                          <input
                            type="checkbox"
                            checked={dashboardComparisonGroupBIds.includes(rep.id)}
                            onChange={(event) => {
                              setDashboardComparisonGroupBIds((prev) => {
                                const nextSet = new Set(prev);
                                if (event.target.checked) {
                                  nextSet.add(rep.id);
                                } else {
                                  nextSet.delete(rep.id);
                                }
                                return orderDashboardSalesRepIds(nextSet);
                              });
                            }}
                          />
                          {rep.name}
                        </label>
                      ))}
                    </div>
                    <div className="actions">
                      <button
                        type="button"
                        onClick={() => setDashboardComparisonGroupBIds(dashboardSalesRepOptions.map((option) => option.id))}
                        disabled={dashboardComparisonGroupBIds.length === dashboardSalesRepOptions.length}
                      >
                        Select all B
                      </button>
                      <button
                        type="button"
                        onClick={() => setDashboardComparisonGroupBIds([])}
                        disabled={dashboardComparisonGroupBIds.length === 0}
                      >
                        Clear B
                      </button>
                    </div>
                  </article>
                </div>
                {!dashboardCanCompareGroups ? (
                  <p className="message">Select at least 1 salesman in Group A and 1 salesman in Group B.</p>
                ) : (
                  <>
                    <div className="compare-merchants-summary">
                      <article className="customer-card">
                        <h3>Group A ({dashboardComparisonGroupASummary.salesmenCount})</h3>
                        <p>
                          TOP product sales: <strong>{dashboardComparisonGroupASummary.topProductTotalTurnoverNetCzk} CZK</strong>
                        </p>
                        <p>
                          Category sales: <strong>{dashboardComparisonGroupASummary.categoryTotalTurnoverNetCzk} CZK</strong>
                        </p>
                      </article>
                      <article className="customer-card">
                        <h3>Group B ({dashboardComparisonGroupBSummary.salesmenCount})</h3>
                        <p>
                          TOP product sales: <strong>{dashboardComparisonGroupBSummary.topProductTotalTurnoverNetCzk} CZK</strong>
                        </p>
                        <p>
                          Category sales: <strong>{dashboardComparisonGroupBSummary.categoryTotalTurnoverNetCzk} CZK</strong>
                        </p>
                      </article>
                    </div>

                    <article className="comparison-section">
                      <h3>Sales of TOP products (Group A vs Group B)</h3>
                      <div className="comparison-table-wrap">
                        <table className="comparison-table">
                          <thead>
                            <tr>
                              <th>TOP product</th>
                              <th>Group A</th>
                              <th>Group B</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dashboardTopProductComparisonRows.map((row) => (
                              <tr key={row.topProductId}>
                                <td>{row.topProductName}</td>
                                <td>{row.groupA ? `${row.groupA.turnoverNetCzk} CZK (${row.groupA.sharePct}%)` : "-"}</td>
                                <td>{row.groupB ? `${row.groupB.turnoverNetCzk} CZK (${row.groupB.sharePct}%)` : "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>

                    <article className="comparison-section">
                      <h3>Category share (Group A vs Group B)</h3>
                      <div className="comparison-table-wrap">
                        <table className="comparison-table">
                          <thead>
                            <tr>
                              <th>Category</th>
                              <th>Group A</th>
                              <th>Group B</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dashboardCategoryComparisonRows.map((row) => (
                              <tr key={row.category}>
                                <td>{row.category}</td>
                                <td>{row.groupA ? `${row.groupA.turnoverNetCzk} CZK (${row.groupA.sharePct}%)` : "-"}</td>
                                <td>{row.groupB ? `${row.groupB.turnoverNetCzk} CZK (${row.groupB.sharePct}%)` : "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                    {dashboardTopProductComparisonRows.length === 0 && dashboardCategoryComparisonRows.length === 0 ? (
                      <p className="message">No sales data available for selected groups.</p>
                    ) : null}
                  </>
                )}
              </section>
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
