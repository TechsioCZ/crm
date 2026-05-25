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

type ImportErrorItem = {
  recordIndex: number;
  orderIdValue: string | null;
  customerIdValue: string | null;
  message: string;
};

type ImportRun = {
  id: number;
  sourceName: string | null;
  startedAt: string;
  finishedAt: string | null;
  totalRecords: number;
  createdOrders: number;
  updatedOrders: number;
  errorRecords: number;
};

type ImportHistoryItem = ImportRun & {
  triggeredBy: {
    id: number;
    name: string;
    email: string;
  } | null;
  sampleErrors: Array<{
    id: number;
    recordIndex: number;
    orderIdValue: string | null;
    customerIdValue: string | null;
    message: string;
    createdAt: string;
  }>;
  totalErrorDetails: number;
};

type ImportResponse = {
  message: string;
  run: ImportRun;
  createdOrderIds: string[];
  updatedOrderIds: string[];
  errors: ImportErrorItem[];
};

type ProductAnalyticsResponse = {
  period: {
    from: string;
    to: string;
    fromUtc: string;
    toUtc: string;
  };
  customer: {
    id: number;
    name: string;
  };
  totals: {
    ordersCount: number;
    itemLinesCount: number;
    productItemLinesCount: number;
    productNetCzk: string;
    shippingNetCzk: string;
    paymentNetCzk: string;
    otherNetCzk: string;
    allItemLinesNetCzk: string;
  };
  productBreakdown: Array<{
    key: string;
    sku: string | null;
    name: string | null;
    category: string | null;
    turnoverNetCzk: string;
    lineCount: number;
  }>;
  categoryBreakdown: Array<{
    category: string;
    turnoverNetCzk: string;
    sharePct: string;
    lineCount: number;
  }>;
  catalogCategoryStats: {
    totalCatalogCategories: number;
    boughtCatalogCategoriesCount: number;
    neverBoughtCategories: string[];
  };
  topProductStats: {
    topProductsTotalCount: number;
    topProductsBoughtCount: number;
    topProductsPenetrationPct: string;
    boughtTopProducts: Array<{
      id: number;
      name: string;
      sku: string | null;
      categoryName: string | null;
    }>;
    neverBoughtTopProducts: Array<{
      id: number;
      name: string;
      sku: string | null;
      categoryName: string | null;
    }>;
  };
};

type RecommendationGroup = {
  id: number;
  name: string;
  scope: "global" | "private";
  filterType: "active_orders_last_months";
  monthsBack: number;
  owner: {
    id: number;
    role: UserRole;
    name: string;
    email: string;
  } | null;
  totalMembers: number;
  visibleMembers: number;
};

type RecommendationRule = {
  id: number;
  name: string;
  scope: "global" | "private";
  targetType: "category" | "top_product";
  targetValue: string;
  minPenetrationPct: string;
  isActive: boolean;
  group: {
    id: number;
    name: string;
    scope: "global" | "private";
  };
  comparisonGroup: {
    id: number;
    name: string;
    scope: "global" | "private";
  } | null;
};

type RecommendationOpportunity = {
  ruleId: number;
  ruleName: string;
  ruleScope: "global" | "private";
  targetType: "category" | "top_product";
  targetValue: string;
  customerId: number;
  customerName: string;
  comparisonPenetrationPct: string;
  minPenetrationPct: string;
};

type WorkspaceTab = "customers" | "analytics" | "recommendations" | "crm" | "admin" | "imports";

type TaskPriority = "low" | "medium" | "high";

type CrmNote = {
  id: number;
  text: string;
  createdAt: string;
  author: {
    id: number;
    name: string;
    email: string;
  };
};

type CrmTask = {
  id: number;
  description: string;
  dueDate: string;
  priority: TaskPriority;
  status: "open" | "done";
  createdAt: string;
  completedAt: string | null;
  customer: {
    id: number;
    name: string;
  };
  owner: {
    id: number;
    name: string;
    email: string;
  };
};

type TurnoverTrendResponse = {
  customer: {
    id: number;
    name: string;
  };
  currentPeriod: {
    from: string;
    to: string;
    productTurnoverNetCzk: string;
  };
  previousPeriod: {
    from: string;
    to: string;
    productTurnoverNetCzk: string;
  };
  comparison: {
    absoluteChangeNetCzk: string;
    changePct: string | null;
    direction: "up" | "down" | "flat";
  };
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

const SAMPLE_XML_CREATE = `<orders>
  <order>
    <order_id>123</order_id>
    <customer_id>1</customer_id>
    <status>ceka na dodavatele</status>
    <items>
      <item>
        <type>product</type>
        <sku>RUK-001</sku>
        <name>Rukavice</name>
        <category>Ochrana</category>
        <quantity>2</quantity>
        <unit_price_net_czk>500</unit_price_net_czk>
        <line_net_czk>1000</line_net_czk>
      </item>
      <item>
        <type>shipping</type>
        <name>Doprava</name>
        <quantity>1</quantity>
        <unit_price_net_czk>150</unit_price_net_czk>
        <line_net_czk>150</line_net_czk>
      </item>
    </items>
  </order>
</orders>`;

const SAMPLE_XML_UPDATE = `<orders>
  <order>
    <order_id>123</order_id>
    <customer_id>1</customer_id>
    <status>v preprave</status>
    <items>
      <item>
        <type>product</type>
        <sku>RUK-001</sku>
        <name>Rukavice</name>
        <category>Ochrana</category>
        <quantity>2</quantity>
        <unit_price_net_czk>500</unit_price_net_czk>
        <line_net_czk>1000</line_net_czk>
      </item>
      <item>
        <type>payment</type>
        <name>Platba kartou</name>
        <quantity>1</quantity>
        <unit_price_net_czk>50</unit_price_net_czk>
        <line_net_czk>50</line_net_czk>
      </item>
    </items>
  </order>
</orders>`;

const SAMPLE_XML_INVALID = `<orders>
  <order>
    <order_id>999</order_id>
    <status>nova</status>
  </order>
</orders>`;

const SAMPLE_XML_PHASE6 = `<orders>
  <order>
    <order_id>PHASE6-100</order_id>
    <customer_id>1</customer_id>
    <status>dokoncena</status>
    <imported_at>2026-03-10T10:00:00Z</imported_at>
    <items>
      <item>
        <type>product</type>
        <sku>TOP-001</sku>
        <name>Kompozit A</name>
        <category>Vyplnove materialy</category>
        <quantity>1</quantity>
        <unit_price_net_czk>1000</unit_price_net_czk>
        <line_net_czk>1000</line_net_czk>
      </item>
      <item>
        <type>product</type>
        <sku>TOP-002</sku>
        <name>Kompozit B</name>
        <category>Vyplnove materialy</category>
        <quantity>1</quantity>
        <unit_price_net_czk>1500</unit_price_net_czk>
        <line_net_czk>1500</line_net_czk>
      </item>
      <item>
        <type>product</type>
        <sku>TOP-003</sku>
        <name>Rukavice Premium</name>
        <category>Ochrana</category>
        <quantity>1</quantity>
        <unit_price_net_czk>7500</unit_price_net_czk>
        <line_net_czk>7500</line_net_czk>
      </item>
    </items>
  </order>
</orders>`;

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

  const [importSourceName, setImportSourceName] = useState("manual-xml-demo");
  const [xmlPayload, setXmlPayload] = useState(SAMPLE_XML_CREATE);
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);
  const [latestImport, setLatestImport] = useState<ImportResponse | null>(null);
  const [importMessage, setImportMessage] = useState("Import panel not loaded yet.");
  const [isImporting, setIsImporting] = useState(false);

  const [analyticsFrom, setAnalyticsFrom] = useState("2026-01-01");
  const [analyticsTo, setAnalyticsTo] = useState("2026-12-31");
  const [analyticsMessage, setAnalyticsMessage] = useState("Analytics panel not loaded yet.");
  const [analyticsResult, setAnalyticsResult] = useState<ProductAnalyticsResponse | null>(null);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);

  const [groups, setGroups] = useState<RecommendationGroup[]>([]);
  const [rules, setRules] = useState<RecommendationRule[]>([]);
  const [opportunities, setOpportunities] = useState<RecommendationOpportunity[]>([]);
  const [customerRecommendations, setCustomerRecommendations] = useState<RecommendationOpportunity[]>([]);
  const [recommendationMessage, setRecommendationMessage] = useState("Recommendations panel not loaded yet.");
  const [groupMessage, setGroupMessage] = useState("No group action yet.");
  const [ruleMessage, setRuleMessage] = useState("No rule action yet.");
  const [isRecommendationLoading, setIsRecommendationLoading] = useState(false);
  const [isGroupSubmitting, setIsGroupSubmitting] = useState(false);
  const [isRuleSubmitting, setIsRuleSubmitting] = useState(false);

  const [groupName, setGroupName] = useState("Aktivni ordinace");
  const [groupScope, setGroupScope] = useState<"global" | "private">("global");
  const [groupMonthsBack, setGroupMonthsBack] = useState("12");

  const [ruleName, setRuleName] = useState("Doporucit Profylaxi");
  const [ruleScope, setRuleScope] = useState<"global" | "private">("global");
  const [ruleTargetType, setRuleTargetType] = useState<"category" | "top_product">("category");
  const [ruleTargetValue, setRuleTargetValue] = useState("Profylaxe");
  const [ruleMinPenetrationPct, setRuleMinPenetrationPct] = useState("30");
  const [ruleGroupId, setRuleGroupId] = useState<number | null>(null);
  const [ruleComparisonGroupId, setRuleComparisonGroupId] = useState<number | null>(null);

  const [crmMessage, setCrmMessage] = useState("CRM panel not loaded yet.");
  const [noteText, setNoteText] = useState("Domluvit nabidku na rukavice");
  const [taskDescription, setTaskDescription] = useState("Zavolat ohledne Profylaxe");
  const [taskDueDate, setTaskDueDate] = useState("2026-06-15");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [notes, setNotes] = useState<CrmNote[]>([]);
  const [customerTasks, setCustomerTasks] = useState<CrmTask[]>([]);
  const [myTasks, setMyTasks] = useState<CrmTask[]>([]);
  const [trendFrom, setTrendFrom] = useState("2026-01-01");
  const [trendTo, setTrendTo] = useState("2026-03-31");
  const [trendResult, setTrendResult] = useState<TurnoverTrendResponse | null>(null);
  const [isCrmLoading, setIsCrmLoading] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceTab>("customers");

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

  const loadVisibleCustomers = async (accessToken: string): Promise<number | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/customers`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        setCustomerMessage(`Customer list failed (${response.status}).`);
        return null;
      }

      const body = (await response.json()) as { customers: CustomerListItem[] };
      setVisibleCustomers(body.customers);
      setAnalyticsResult(null);
      setTrendResult(null);

      if (body.customers.length > 0) {
        const id = body.customers[0].id;
        setSelectedVisibleCustomerId(id);
        await loadCustomerDetail(accessToken, id);
        setCustomerMessage(`Loaded ${body.customers.length} visible customers.`);
        return id;
      } else {
        setSelectedVisibleCustomerId(null);
        setCustomerDetail(null);
        setCustomerRecommendations([]);
        setNotes([]);
        setCustomerTasks([]);
        setTrendResult(null);
      }

      setCustomerMessage(`Loaded ${body.customers.length} visible customers.`);
      return null;
    } catch {
      setCustomerMessage("Failed to load visible customers.");
      return null;
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

  const loadProductAnalytics = async (accessToken: string, customerId: number) => {
    if (!analyticsFrom || !analyticsTo) {
      setAnalyticsMessage("Please choose both dates first.");
      return;
    }

    if (analyticsFrom > analyticsTo) {
      setAnalyticsMessage("`From` date must be before `To` date.");
      return;
    }

    setIsAnalyticsLoading(true);

    try {
      const query = new URLSearchParams({
        from: analyticsFrom,
        to: analyticsTo
      });

      const response = await fetch(`${API_BASE_URL}/api/customers/${customerId}/analytics/product?${query.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        setAnalyticsResult(null);
        if (response.status === 403) {
          setAnalyticsMessage(`Analytics blocked for customer ${customerId} (403).`);
          return;
        }

        if (response.status === 404) {
          setAnalyticsMessage(`Customer ${customerId} not found (404).`);
          return;
        }

        setAnalyticsMessage(`Analytics request failed (${response.status}).`);
        return;
      }

      const body = (await response.json()) as ProductAnalyticsResponse;
      setAnalyticsResult(body);
      setAnalyticsMessage(
        `Analytics loaded for ${body.customer.name}: product turnover ${body.totals.productNetCzk} CZK (net).`
      );
    } catch {
      setAnalyticsResult(null);
      setAnalyticsMessage("Analytics request failed.");
    } finally {
      setIsAnalyticsLoading(false);
    }
  };

  const loadRecommendationGroups = async (accessToken: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/recommendations/groups`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        setRecommendationMessage(`Groups request failed (${response.status}).`);
        return;
      }

      const body = (await response.json()) as { groups: RecommendationGroup[] };
      setGroups(body.groups);
      setRuleGroupId((prev) => {
        if (body.groups.length === 0) {
          return null;
        }
        if (prev && body.groups.some((group) => group.id === prev)) {
          return prev;
        }
        return body.groups[0].id;
      });
      setRuleComparisonGroupId((prev) => {
        if (body.groups.length === 0) {
          return null;
        }
        if (prev && body.groups.some((group) => group.id === prev)) {
          return prev;
        }
        return null;
      });
      setRecommendationMessage(`Loaded ${body.groups.length} groups.`);
    } catch {
      setRecommendationMessage("Failed to load recommendation groups.");
    }
  };

  const loadRecommendationRules = async (accessToken: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/recommendations/rules`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        setRecommendationMessage(`Rules request failed (${response.status}).`);
        return;
      }

      const body = (await response.json()) as { rules: RecommendationRule[] };
      setRules(body.rules);
      setRecommendationMessage(`Loaded ${body.rules.length} rules.`);
    } catch {
      setRecommendationMessage("Failed to load recommendation rules.");
    }
  };

  const loadRecommendationOpportunities = async (accessToken: string, customerId?: number) => {
    setIsRecommendationLoading(true);
    try {
      const query = new URLSearchParams();
      if (customerId) {
        query.set("customerId", String(customerId));
      }

      const suffix = query.toString() ? `?${query.toString()}` : "";
      const response = await fetch(`${API_BASE_URL}/api/recommendations/opportunities${suffix}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        setRecommendationMessage(`Opportunities request failed (${response.status}).`);
        setOpportunities([]);
        return;
      }

      const body = (await response.json()) as {
        opportunities: RecommendationOpportunity[];
        summary: {
          visibleRules: number;
          visibleOpportunities: number;
        };
      };

      setOpportunities(body.opportunities);
      setRecommendationMessage(
        `Loaded ${body.summary.visibleOpportunities} opportunities from ${body.summary.visibleRules} visible rules.`
      );
    } catch {
      setOpportunities([]);
      setRecommendationMessage("Failed to load recommendation opportunities.");
    } finally {
      setIsRecommendationLoading(false);
    }
  };

  const loadCustomerRecommendations = async (accessToken: string, customerId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/recommendations/customers/${customerId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        if (response.status === 403) {
          setRecommendationMessage(`Recommendations blocked for customer ${customerId} (403).`);
        } else if (response.status === 404) {
          setRecommendationMessage(`Customer ${customerId} not found for recommendations.`);
        } else {
          setRecommendationMessage(`Customer recommendations failed (${response.status}).`);
        }
        setCustomerRecommendations([]);
        return;
      }

      const body = (await response.json()) as {
        customer: {
          id: number;
          name: string;
        };
        recommendations: Array<{
          ruleId: number;
          ruleName: string;
          ruleScope: "global" | "private";
          targetType: "category" | "top_product";
          targetValue: string;
          comparisonPenetrationPct: string;
          minPenetrationPct: string;
        }>;
      };

      const mapped = body.recommendations.map((item) => ({
        ...item,
        customerId: body.customer.id,
        customerName: body.customer.name
      }));

      setCustomerRecommendations(mapped);
      setRecommendationMessage(
        `Customer ${body.customer.name} has ${body.recommendations.length} recommendation opportunities.`
      );
    } catch {
      setCustomerRecommendations([]);
      setRecommendationMessage("Failed to load customer recommendations.");
    }
  };

  const loadCrmCustomerData = async (accessToken: string, customerId: number) => {
    setIsCrmLoading(true);
    try {
      const headers = {
        Authorization: `Bearer ${accessToken}`
      };

      const [notesRes, tasksRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/crm/customers/${customerId}/notes`, { headers }),
        fetch(`${API_BASE_URL}/api/crm/customers/${customerId}/tasks`, { headers })
      ]);

      if (!notesRes.ok || !tasksRes.ok) {
        if (notesRes.status === 403 || tasksRes.status === 403) {
          setCrmMessage(`CRM data blocked for customer ${customerId} (403).`);
        } else if (notesRes.status === 404 || tasksRes.status === 404) {
          setCrmMessage(`Customer ${customerId} not found for CRM data (404).`);
        } else {
          setCrmMessage(`CRM data request failed (${notesRes.status}/${tasksRes.status}).`);
        }
        setNotes([]);
        setCustomerTasks([]);
        return;
      }

      const notesBody = (await notesRes.json()) as { notes: CrmNote[]; customer: { id: number; name: string } };
      const tasksBody = (await tasksRes.json()) as {
        tasks: Array<Omit<CrmTask, "customer">>;
        customer: { id: number; name: string };
      };

      setNotes(notesBody.notes);
      setCustomerTasks(
        tasksBody.tasks.map((task) => ({
          ...task,
          customer: tasksBody.customer
        }))
      );
      setCrmMessage(
        `CRM loaded for ${notesBody.customer.name}: ${notesBody.notes.length} notes, ${tasksBody.tasks.length} customer tasks.`
      );
    } catch {
      setNotes([]);
      setCustomerTasks([]);
      setCrmMessage("CRM request failed.");
    } finally {
      setIsCrmLoading(false);
    }
  };

  const loadMyTasks = async (accessToken: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crm/tasks/mine`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        setCrmMessage(`My tasks request failed (${response.status}).`);
        setMyTasks([]);
        return;
      }

      const body = (await response.json()) as { tasks: CrmTask[]; summary: { count: number } };
      setMyTasks(body.tasks);
      setCrmMessage(`Loaded my task list (${body.summary.count} tasks).`);
    } catch {
      setMyTasks([]);
      setCrmMessage("My tasks request failed.");
    }
  };

  const loadTurnoverTrend = async (accessToken: string, customerId: number) => {
    if (!trendFrom || !trendTo) {
      setCrmMessage("Choose both trend dates first.");
      return;
    }

    if (trendFrom > trendTo) {
      setCrmMessage("Trend `from` date must be before `to` date.");
      return;
    }

    setIsCrmLoading(true);
    try {
      const query = new URLSearchParams({
        from: trendFrom,
        to: trendTo
      });

      const response = await fetch(
        `${API_BASE_URL}/api/crm/customers/${customerId}/turnover-trend?${query.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      if (!response.ok) {
        if (response.status === 403) {
          setCrmMessage(`Trend blocked for customer ${customerId} (403).`);
        } else if (response.status === 404) {
          setCrmMessage(`Customer ${customerId} not found for trend (404).`);
        } else {
          setCrmMessage(`Trend request failed (${response.status}).`);
        }
        setTrendResult(null);
        return;
      }

      const body = (await response.json()) as TurnoverTrendResponse;
      setTrendResult(body);

      const changeText = body.comparison.changePct ? `${body.comparison.changePct}%` : "n/a";
      setCrmMessage(
        `Trend loaded for ${body.customer.name}: current ${body.currentPeriod.productTurnoverNetCzk} CZK vs previous ${body.previousPeriod.productTurnoverNetCzk} CZK (${changeText}).`
      );
    } catch {
      setTrendResult(null);
      setCrmMessage("Trend request failed.");
    } finally {
      setIsCrmLoading(false);
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

  const loadImportHistory = async (accessToken: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/imports`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        setImportMessage(`Import history failed (${response.status}).`);
        return;
      }

      const body = (await response.json()) as { imports: ImportHistoryItem[] };
      setImportHistory(body.imports);
      setImportMessage(`Import history loaded (${body.imports.length} runs).`);
    } catch {
      setImportMessage("Failed to load import history.");
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
      setActiveWorkspace("customers");
      setAuthMessage(`Logged in as ${body.user.email} (${body.user.role})`);

      const firstVisibleCustomerId = await loadVisibleCustomers(body.accessToken);
      await loadRecommendationGroups(body.accessToken);
      await loadRecommendationRules(body.accessToken);
      await loadRecommendationOpportunities(body.accessToken);
      await loadMyTasks(body.accessToken);
      if (firstVisibleCustomerId) {
        await loadCustomerRecommendations(body.accessToken, firstVisibleCustomerId);
        await loadCrmCustomerData(body.accessToken, firstVisibleCustomerId);
        await loadTurnoverTrend(body.accessToken, firstVisibleCustomerId);
      }

      if (body.user.role === "admin") {
        await loadAdminData(body.accessToken);
        await loadImportHistory(body.accessToken);
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
    setAnalyticsResult(null);
    setImportHistory([]);
    setLatestImport(null);
    setGroups([]);
    setRules([]);
    setOpportunities([]);
    setCustomerRecommendations([]);
    setNotes([]);
    setCustomerTasks([]);
    setMyTasks([]);
    setTrendResult(null);
    setAuthMessage("Logged out");
    setAdminMessage("Admin panel not loaded yet.");
    setCustomerMessage("Customer panel not loaded yet.");
    setAnalyticsMessage("Analytics panel not loaded yet.");
    setImportMessage("Import panel not loaded yet.");
    setRecommendationMessage("Recommendations panel not loaded yet.");
    setGroupMessage("No group action yet.");
    setRuleMessage("No rule action yet.");
    setCrmMessage("CRM panel not loaded yet.");
    setActiveWorkspace("customers");
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
      const firstVisibleCustomerId = await loadVisibleCustomers(token);
      await loadRecommendationGroups(token);
      await loadRecommendationRules(token);
      await loadRecommendationOpportunities(token);
      await loadMyTasks(token);
      if (firstVisibleCustomerId) {
        await loadCustomerRecommendations(token, firstVisibleCustomerId);
        await loadCrmCustomerData(token, firstVisibleCustomerId);
        await loadTurnoverTrend(token, firstVisibleCustomerId);
      }

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
    await loadCustomerRecommendations(token, selectedVisibleCustomerId);
    await loadCrmCustomerData(token, selectedVisibleCustomerId);
    await loadTurnoverTrend(token, selectedVisibleCustomerId);
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
    await loadCustomerRecommendations(token, id);
    await loadCrmCustomerData(token, id);
    await loadTurnoverTrend(token, id);
  };

  const handleLoadSelectedAnalytics = async () => {
    if (!token || !selectedVisibleCustomerId) {
      setAnalyticsMessage("No customer selected.");
      return;
    }

    await loadProductAnalytics(token, selectedVisibleCustomerId);
  };

  const handleLoadManualAnalytics = async () => {
    if (!token) {
      setAnalyticsMessage("Please login first.");
      return;
    }

    const id = Number(manualCustomerId);
    if (!Number.isInteger(id) || id <= 0) {
      setAnalyticsMessage("Customer id must be a positive integer.");
      return;
    }

    await loadProductAnalytics(token, id);
  };

  const handleRunXmlImport = async () => {
    if (!token) {
      setImportMessage("Please login first.");
      return;
    }

    if (!xmlPayload.trim()) {
      setImportMessage("XML payload cannot be empty.");
      return;
    }

    setIsImporting(true);
    setImportMessage("Running XML import...");

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/imports/orders/xml`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          sourceName: importSourceName.trim() || "manual-xml",
          xml: xmlPayload
        })
      });

      const raw = (await response.json()) as Partial<ImportResponse> & { message?: string };

      if (!response.ok) {
        setImportMessage(raw.message ?? `Import failed (${response.status}).`);
        return;
      }

      const importResponse = raw as ImportResponse;
      setLatestImport(importResponse);
      setImportMessage(
        `Import done: created ${importResponse.run.createdOrders}, updated ${importResponse.run.updatedOrders}, errors ${importResponse.run.errorRecords}.`
      );

      await loadImportHistory(token);
    } catch {
      setImportMessage("Import request failed.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleRefreshRecommendations = async () => {
    if (!token) {
      setRecommendationMessage("Please login first.");
      return;
    }

    await loadRecommendationGroups(token);
    await loadRecommendationRules(token);
    await loadRecommendationOpportunities(token);

    if (selectedVisibleCustomerId) {
      await loadCustomerRecommendations(token, selectedVisibleCustomerId);
    }
  };

  const handleCreateGroup = async () => {
    if (!token) {
      setGroupMessage("Please login first.");
      return;
    }

    const monthsBack = Number(groupMonthsBack);
    if (!Number.isInteger(monthsBack) || monthsBack < 1 || monthsBack > 60) {
      setGroupMessage("Months back must be a whole number between 1 and 60.");
      return;
    }

    if (!groupName.trim()) {
      setGroupMessage("Group name is required.");
      return;
    }

    setIsGroupSubmitting(true);
    setGroupMessage("Creating group...");

    try {
      const payload = {
        name: groupName.trim(),
        scope: isAdmin ? groupScope : "private",
        filter: {
          type: "active_orders_last_months" as const,
          monthsBack
        }
      };

      const response = await fetch(`${API_BASE_URL}/api/recommendations/groups`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const body = (await response.json().catch(() => null)) as { message?: string; group?: { id: number; name: string } } | null;

      if (!response.ok) {
        setGroupMessage(body?.message ?? `Group creation failed (${response.status}).`);
        return;
      }

      setGroupMessage(`Group "${body?.group?.name ?? groupName}" created.`);
      await loadRecommendationGroups(token);
      await loadRecommendationRules(token);
      await loadRecommendationOpportunities(token);
      if (body?.group?.id) {
        setRuleGroupId(body.group.id);
        setRuleComparisonGroupId(body.group.id);
      }
    } catch {
      setGroupMessage("Group creation request failed.");
    } finally {
      setIsGroupSubmitting(false);
    }
  };

  const handleCreateRule = async () => {
    if (!token) {
      setRuleMessage("Please login first.");
      return;
    }

    if (!ruleGroupId) {
      setRuleMessage("Select a target group first.");
      return;
    }

    if (!ruleName.trim()) {
      setRuleMessage("Rule name is required.");
      return;
    }

    if (!ruleTargetValue.trim()) {
      setRuleMessage("Target value is required.");
      return;
    }

    const minPenetrationPct = Number(ruleMinPenetrationPct);
    if (Number.isNaN(minPenetrationPct) || minPenetrationPct < 0 || minPenetrationPct > 100) {
      setRuleMessage("Min penetration must be a number between 0 and 100.");
      return;
    }

    setIsRuleSubmitting(true);
    setRuleMessage("Creating rule...");

    try {
      const payload = {
        name: ruleName.trim(),
        scope: isAdmin ? ruleScope : "private",
        groupId: ruleGroupId,
        comparisonGroupId: ruleComparisonGroupId ?? undefined,
        targetType: ruleTargetType,
        targetValue: ruleTargetValue.trim(),
        minPenetrationPct
      };

      const response = await fetch(`${API_BASE_URL}/api/recommendations/rules`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const body = (await response.json().catch(() => null)) as { message?: string; rule?: { name: string } } | null;
      if (!response.ok) {
        setRuleMessage(body?.message ?? `Rule creation failed (${response.status}).`);
        return;
      }

      setRuleMessage(`Rule "${body?.rule?.name ?? ruleName}" created.`);
      await loadRecommendationRules(token);
      await loadRecommendationOpportunities(token);
      if (selectedVisibleCustomerId) {
        await loadCustomerRecommendations(token, selectedVisibleCustomerId);
      }
    } catch {
      setRuleMessage("Rule creation request failed.");
    } finally {
      setIsRuleSubmitting(false);
    }
  };

  const handleLoadSelectedRecommendations = async () => {
    if (!token || !selectedVisibleCustomerId) {
      setRecommendationMessage("No customer selected.");
      return;
    }

    await loadCustomerRecommendations(token, selectedVisibleCustomerId);
    await loadRecommendationOpportunities(token, selectedVisibleCustomerId);
  };

  const handleLoadManualRecommendations = async () => {
    if (!token) {
      setRecommendationMessage("Please login first.");
      return;
    }

    const id = Number(manualCustomerId);
    if (!Number.isInteger(id) || id <= 0) {
      setRecommendationMessage("Customer id must be a positive integer.");
      return;
    }

    await loadCustomerRecommendations(token, id);
    await loadRecommendationOpportunities(token, id);
  };

  const handleLoadSelectedCrm = async () => {
    if (!token || !selectedVisibleCustomerId) {
      setCrmMessage("No customer selected.");
      return;
    }

    await loadCrmCustomerData(token, selectedVisibleCustomerId);
  };

  const handleLoadManualCrm = async () => {
    if (!token) {
      setCrmMessage("Please login first.");
      return;
    }

    const id = Number(manualCustomerId);
    if (!Number.isInteger(id) || id <= 0) {
      setCrmMessage("Customer id must be a positive integer.");
      return;
    }

    await loadCrmCustomerData(token, id);
  };

  const handleLoadSelectedTrend = async () => {
    if (!token || !selectedVisibleCustomerId) {
      setCrmMessage("No customer selected.");
      return;
    }

    await loadTurnoverTrend(token, selectedVisibleCustomerId);
  };

  const handleLoadManualTrend = async () => {
    if (!token) {
      setCrmMessage("Please login first.");
      return;
    }

    const id = Number(manualCustomerId);
    if (!Number.isInteger(id) || id <= 0) {
      setCrmMessage("Customer id must be a positive integer.");
      return;
    }

    await loadTurnoverTrend(token, id);
  };

  const handleCreateNote = async () => {
    if (!token || !selectedVisibleCustomerId) {
      setCrmMessage("Select customer first.");
      return;
    }

    if (!noteText.trim()) {
      setCrmMessage("Note text is required.");
      return;
    }

    setIsCrmLoading(true);
    setCrmMessage("Creating note...");

    try {
      const response = await fetch(`${API_BASE_URL}/api/crm/customers/${selectedVisibleCustomerId}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          text: noteText.trim()
        })
      });

      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setCrmMessage(body?.message ?? `Create note failed (${response.status}).`);
        return;
      }

      setCrmMessage("Note created.");
      await loadCrmCustomerData(token, selectedVisibleCustomerId);
    } catch {
      setCrmMessage("Create note request failed.");
    } finally {
      setIsCrmLoading(false);
    }
  };

  const handleCreateTask = async () => {
    if (!token || !selectedVisibleCustomerId) {
      setCrmMessage("Select customer first.");
      return;
    }

    if (!taskDescription.trim()) {
      setCrmMessage("Task description is required.");
      return;
    }

    if (!taskDueDate) {
      setCrmMessage("Task due date is required.");
      return;
    }

    setIsCrmLoading(true);
    setCrmMessage("Creating task...");

    try {
      const response = await fetch(`${API_BASE_URL}/api/crm/customers/${selectedVisibleCustomerId}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          description: taskDescription.trim(),
          dueDate: taskDueDate,
          priority: taskPriority
        })
      });

      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setCrmMessage(body?.message ?? `Create task failed (${response.status}).`);
        return;
      }

      setCrmMessage("Task created.");
      await loadCrmCustomerData(token, selectedVisibleCustomerId);
      await loadMyTasks(token);
    } catch {
      setCrmMessage("Create task request failed.");
    } finally {
      setIsCrmLoading(false);
    }
  };

  const tabs: Array<{ id: WorkspaceTab; label: string; adminOnly?: boolean }> = [
    { id: "customers", label: "Contacts" },
    { id: "analytics", label: "Analytics" },
    { id: "recommendations", label: "Smart Lists" },
    { id: "crm", label: "Tasks" },
    { id: "admin", label: "Admin", adminOnly: true },
    { id: "imports", label: "Imports", adminOnly: true }
  ];
  const visibleTabs = tabs.filter((tab) => !tab.adminOnly || isAdmin);
  const resolvedWorkspace = visibleTabs.some((tab) => tab.id === activeWorkspace) ? activeWorkspace : "customers";

  if (!isLoggedIn) {
    return (
      <main className="auth-layout">
        <section className="auth-card" aria-label="login screen">
          <p className="eyebrow">CRM MVP</p>
          <h1>Login</h1>
          <p className="subtitle">Sign in first. The full CRM workspace opens after authentication.</p>

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

        <label className="search-box">
          Search
          <input value={manualCustomerId} onChange={(e) => setManualCustomerId(e.target.value)} placeholder="Customer ID" />
        </label>

        <nav className="side-nav" aria-label="workspace sections">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={resolvedWorkspace === tab.id ? "tab-btn active" : "tab-btn"}
              onClick={() => setActiveWorkspace(tab.id)}
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
            {visibleTabs.map((tab) => (
              <button
                key={`top-${tab.id}`}
                type="button"
                className={resolvedWorkspace === tab.id ? "top-tab active" : "top-tab"}
                onClick={() => setActiveWorkspace(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="top-actions">
            <button type="button" onClick={handleMe}>
              Check Session
            </button>
            <span className="hint">{authMessage}</span>
          </div>
        </header>

        <section className="workspace-scroll">
          {resolvedWorkspace === "customers" && (
            <div className="workspace-grid">
              <article className="panel">
                <div className="admin-head">
                  <h2>Role Visibility</h2>
                  <button type="button" onClick={() => token && loadVisibleCustomers(token)}>
                    Refresh
                  </button>
                </div>
                <p className="message">{customerMessage}</p>
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
                    Load selected
                  </button>
                </div>
                <div className="assign-row">
                  <input value={manualCustomerId} onChange={(e) => setManualCustomerId(e.target.value)} />
                  <button type="button" onClick={handleLoadManualDetail}>
                    Load by ID
                  </button>
                </div>
              </article>

              <article className="panel">
                <h2>Customer Detail</h2>
                {customerDetail ? (
                  <article className="customer-card">
                    <h3>
                      {customerDetail.id} - {customerDetail.name}
                    </h3>
                    <p>
                      Current rep: <strong>{customerDetail.currentAssignment?.salesRep.name ?? "Unassigned"}</strong>
                    </p>
                    <details>
                      <summary>Assignment history ({customerDetail.assignmentHistory.length})</summary>
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
                ) : (
                  <p className="hint">No customer detail loaded.</p>
                )}
              </article>

              <article className="panel">
                <h2>Selected Opportunities</h2>
                <div className="actions">
                  <button type="button" onClick={handleLoadSelectedRecommendations} disabled={isRecommendationLoading}>
                    Load selected opportunities
                  </button>
                  <button type="button" onClick={handleLoadManualRecommendations} disabled={isRecommendationLoading}>
                    Load manual opportunities
                  </button>
                </div>
                <ul className="history-list">
                  {customerRecommendations.map((item) => (
                    <li key={`customer-${item.customerId}-${item.ruleId}`}>
                      {item.customerName}: {item.ruleName} ({item.targetType}:{item.targetValue})
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          )}

          {resolvedWorkspace === "analytics" && (
            <div className="workspace-grid">
              <article className="panel">
                <h2>Analytics Controls</h2>
                <p className="message">{analyticsMessage}</p>
                <div className="date-row">
                  <label>
                    From date
                    <input type="date" value={analyticsFrom} onChange={(e) => setAnalyticsFrom(e.target.value)} />
                  </label>
                  <label>
                    To date
                    <input type="date" value={analyticsTo} onChange={(e) => setAnalyticsTo(e.target.value)} />
                  </label>
                </div>
                <div className="actions">
                  <button type="button" onClick={handleLoadSelectedAnalytics} disabled={isAnalyticsLoading}>
                    Selected customer analytics
                  </button>
                  <button type="button" onClick={handleLoadManualAnalytics} disabled={isAnalyticsLoading}>
                    Manual customer analytics
                  </button>
                </div>
              </article>

              <article className="panel">
                <h2>Product Analytics</h2>
                {analyticsResult ? (
                  <article className="customer-card">
                    <h3>
                      {analyticsResult.customer.name} ({analyticsResult.customer.id})
                    </h3>
                    <p>
                      Product turnover: <strong>{analyticsResult.totals.productNetCzk} CZK</strong>
                    </p>
                    <p>
                      Top penetration: <strong>{analyticsResult.topProductStats.topProductsPenetrationPct}%</strong>
                    </p>
                    <details>
                      <summary>Category breakdown ({analyticsResult.categoryBreakdown.length})</summary>
                      <ul className="history-list">
                        {analyticsResult.categoryBreakdown.map((category) => (
                          <li key={category.category}>
                            {category.category}: {category.turnoverNetCzk} CZK ({category.sharePct}%)
                          </li>
                        ))}
                      </ul>
                    </details>
                    <details>
                      <summary>Never bought categories ({analyticsResult.catalogCategoryStats.neverBoughtCategories.length})</summary>
                      <ul className="history-list">
                        {analyticsResult.catalogCategoryStats.neverBoughtCategories.map((categoryName) => (
                          <li key={categoryName}>{categoryName}</li>
                        ))}
                      </ul>
                    </details>
                  </article>
                ) : (
                  <p className="hint">No analytics loaded yet.</p>
                )}
              </article>

              <article className="panel">
                <h2>Turnover Trend</h2>
                <p className="message">{crmMessage}</p>
                <div className="date-row">
                  <label>
                    Trend from
                    <input type="date" value={trendFrom} onChange={(e) => setTrendFrom(e.target.value)} />
                  </label>
                  <label>
                    Trend to
                    <input type="date" value={trendTo} onChange={(e) => setTrendTo(e.target.value)} />
                  </label>
                </div>
                <div className="actions">
                  <button type="button" onClick={handleLoadSelectedTrend} disabled={isCrmLoading}>
                    Trend for selected customer
                  </button>
                  <button type="button" onClick={handleLoadManualTrend} disabled={isCrmLoading}>
                    Trend by manual ID
                  </button>
                </div>
                {trendResult && (
                  <article className="customer-card">
                    <h3>{trendResult.customer.name}</h3>
                    <p>
                      Current: <strong>{trendResult.currentPeriod.productTurnoverNetCzk} CZK</strong>
                    </p>
                    <p>
                      Previous: <strong>{trendResult.previousPeriod.productTurnoverNetCzk} CZK</strong>
                    </p>
                    <p>
                      Change: <strong>{trendResult.comparison.changePct ? `${trendResult.comparison.changePct}%` : "n/a"}</strong>
                    </p>
                  </article>
                )}
              </article>
            </div>
          )}

          {resolvedWorkspace === "recommendations" && (
            <div className="workspace-grid">
              <article className="panel">
                <h2>Create Group</h2>
                <label>
                  Group name
                  <input value={groupName} onChange={(e) => setGroupName(e.target.value)} />
                </label>
                <div className="date-row">
                  <label>
                    Scope
                    <select
                      value={isAdmin ? groupScope : "private"}
                      onChange={(e) => setGroupScope(e.target.value as "global" | "private")}
                      disabled={!isAdmin}
                    >
                      <option value="global">global</option>
                      <option value="private">private</option>
                    </select>
                  </label>
                  <label>
                    Active months back
                    <input value={groupMonthsBack} onChange={(e) => setGroupMonthsBack(e.target.value)} />
                  </label>
                </div>
                <div className="actions">
                  <button type="button" onClick={handleCreateGroup} disabled={isGroupSubmitting}>
                    {isGroupSubmitting ? "Creating..." : "Create group"}
                  </button>
                </div>
                <p className="hint">{groupMessage}</p>
              </article>

              <article className="panel">
                <h2>Create Rule</h2>
                <label>
                  Rule name
                  <input value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
                </label>
                <div className="date-row">
                  <label>
                    Scope
                    <select
                      value={isAdmin ? ruleScope : "private"}
                      onChange={(e) => setRuleScope(e.target.value as "global" | "private")}
                      disabled={!isAdmin}
                    >
                      <option value="global">global</option>
                      <option value="private">private</option>
                    </select>
                  </label>
                  <label>
                    Target type
                    <select value={ruleTargetType} onChange={(e) => setRuleTargetType(e.target.value as "category" | "top_product")}>
                      <option value="category">category</option>
                      <option value="top_product">top_product</option>
                    </select>
                  </label>
                </div>
                <div className="date-row">
                  <label>
                    Target group
                    <select
                      value={ruleGroupId ?? ""}
                      onChange={(e) => setRuleGroupId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Select group</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name} ({group.scope})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Comparison group
                    <select
                      value={ruleComparisonGroupId ?? ""}
                      onChange={(e) => setRuleComparisonGroupId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">same as target group</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name} ({group.scope})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="date-row">
                  <label>
                    Target value
                    <input value={ruleTargetValue} onChange={(e) => setRuleTargetValue(e.target.value)} />
                  </label>
                  <label>
                    Min penetration (%)
                    <input value={ruleMinPenetrationPct} onChange={(e) => setRuleMinPenetrationPct(e.target.value)} />
                  </label>
                </div>
                <div className="actions">
                  <button type="button" onClick={handleCreateRule} disabled={isRuleSubmitting}>
                    {isRuleSubmitting ? "Creating..." : "Create rule"}
                  </button>
                  <button type="button" onClick={handleRefreshRecommendations} disabled={isRecommendationLoading}>
                    Refresh recommendations
                  </button>
                </div>
                <p className="hint">{ruleMessage}</p>
              </article>

              <article className="panel">
                <h2>Opportunities</h2>
                <p className="message">{recommendationMessage}</p>
                <div className="actions">
                  <button type="button" onClick={() => token && loadRecommendationOpportunities(token)} disabled={isRecommendationLoading}>
                    Load all visible
                  </button>
                  <button type="button" onClick={handleLoadSelectedRecommendations} disabled={isRecommendationLoading}>
                    Selected customer
                  </button>
                  <button type="button" onClick={handleLoadManualRecommendations} disabled={isRecommendationLoading}>
                    Manual customer
                  </button>
                </div>
                <details>
                  <summary>Visible groups ({groups.length})</summary>
                  <ul className="history-list">
                    {groups.map((group) => (
                      <li key={group.id}>
                        #{group.id} {group.name} [{group.scope}] {group.visibleMembers}/{group.totalMembers}
                      </li>
                    ))}
                  </ul>
                </details>
                <details>
                  <summary>Visible rules ({rules.length})</summary>
                  <ul className="history-list">
                    {rules.map((rule) => (
                      <li key={rule.id}>
                        #{rule.id} {rule.name} [{rule.scope}] {rule.targetType}:{rule.targetValue}
                      </li>
                    ))}
                  </ul>
                </details>
                <details open>
                  <summary>All visible opportunities ({opportunities.length})</summary>
                  <ul className="history-list">
                    {opportunities.map((item) => (
                      <li key={`${item.customerId}-${item.ruleId}`}>
                        {item.customerName}: {item.ruleName} ({item.targetType}:{item.targetValue})
                      </li>
                    ))}
                  </ul>
                </details>
              </article>
            </div>
          )}

          {resolvedWorkspace === "crm" && (
            <div className="workspace-grid">
              <article className="panel">
                <div className="admin-head">
                  <h2>CRM Actions</h2>
                  <button type="button" onClick={() => token && loadMyTasks(token)} disabled={isCrmLoading}>
                    {isCrmLoading ? "Loading..." : "Refresh my tasks"}
                  </button>
                </div>
                <p className="message">{crmMessage}</p>
                <div className="actions">
                  <button type="button" onClick={handleLoadSelectedCrm} disabled={isCrmLoading}>
                    Load selected CRM
                  </button>
                  <button type="button" onClick={handleLoadManualCrm} disabled={isCrmLoading}>
                    Load manual CRM
                  </button>
                </div>
                <label>
                  Note text
                  <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4} />
                </label>
                <button type="button" onClick={handleCreateNote} disabled={isCrmLoading}>
                  Create note
                </button>
                <label>
                  Task description
                  <input value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} />
                </label>
                <div className="date-row">
                  <label>
                    Due date
                    <input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
                  </label>
                  <label>
                    Priority
                    <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}>
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                    </select>
                  </label>
                </div>
                <button type="button" onClick={handleCreateTask} disabled={isCrmLoading}>
                  Create task
                </button>
              </article>

              <article className="panel">
                <h2>Customer Notes ({notes.length})</h2>
                <ul className="history-list">
                  {notes.map((note) => (
                    <li key={note.id}>
                      {new Date(note.createdAt).toLocaleString()}: {note.text} ({note.author.name})
                    </li>
                  ))}
                </ul>
                <h2>Customer Tasks ({customerTasks.length})</h2>
                <ul className="history-list">
                  {customerTasks.map((task) => (
                    <li key={task.id}>
                      {task.description} | due {new Date(task.dueDate).toLocaleDateString()} | {task.priority} | {task.status}
                    </li>
                  ))}
                </ul>
              </article>

              <article className="panel">
                <h2>My Tasks ({myTasks.length})</h2>
                <ul className="history-list">
                  {myTasks.map((task) => (
                    <li key={`mine-${task.id}`}>
                      {task.customer.name}: {task.description} | due {new Date(task.dueDate).toLocaleDateString()} | {task.priority}
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          )}

          {resolvedWorkspace === "admin" && isAdmin && (
            <section className="panel" aria-label="admin assignments">
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
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {resolvedWorkspace === "imports" && isAdmin && (
            <section className="panel" aria-label="xml import panel">
              <div className="admin-head">
                <h2>XML Import Panel</h2>
                <button type="button" onClick={() => token && loadImportHistory(token)}>
                  Refresh import history
                </button>
              </div>
              <p className="message">{importMessage}</p>
              <div className="actions">
                <button type="button" onClick={() => setXmlPayload(SAMPLE_XML_CREATE)}>
                  Load sample: create
                </button>
                <button type="button" onClick={() => setXmlPayload(SAMPLE_XML_UPDATE)}>
                  Load sample: update
                </button>
                <button type="button" onClick={() => setXmlPayload(SAMPLE_XML_INVALID)}>
                  Load sample: invalid
                </button>
                <button type="button" onClick={() => setXmlPayload(SAMPLE_XML_PHASE6)}>
                  Load sample: phase6 analytics
                </button>
              </div>
              <label>
                Source name
                <input value={importSourceName} onChange={(e) => setImportSourceName(e.target.value)} />
              </label>
              <label>
                XML payload
                <textarea className="xml-editor" value={xmlPayload} onChange={(e) => setXmlPayload(e.target.value)} rows={16} />
              </label>
              <div className="actions">
                <button type="button" onClick={handleRunXmlImport} disabled={isImporting}>
                  {isImporting ? "Importing..." : "Run XML import"}
                </button>
              </div>
              {latestImport && (
                <article className="customer-card">
                  <h3>Latest import run #{latestImport.run.id}</h3>
                  <p>
                    Created: <strong>{latestImport.run.createdOrders}</strong> | Updated:{" "}
                    <strong>{latestImport.run.updatedOrders}</strong> | Errors: <strong>{latestImport.run.errorRecords}</strong>
                  </p>
                </article>
              )}
              <div className="customer-list">
                {importHistory.map((run) => (
                  <article className="customer-card" key={run.id}>
                    <h3>
                      Import #{run.id} ({run.sourceName ?? "manual-xml"})
                    </h3>
                    <p>
                      Created: <strong>{run.createdOrders}</strong> | Updated: <strong>{run.updatedOrders}</strong> | Errors:{" "}
                      <strong>{run.errorRecords}</strong>
                    </p>
                  </article>
                ))}
              </div>
            </section>
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
