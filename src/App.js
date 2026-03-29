import { useEffect, useMemo, useState } from "react";
import { Bar, Pie } from "react-chartjs-2";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";

ChartJS.register(ArcElement, BarElement, CategoryScale, Legend, LinearScale, Tooltip);

const STORAGE_KEYS = {
  transactions: "financeTracker_transactions",
  budget: "financeTracker_budget",
  theme: "financeTracker_theme",
};

const CATEGORIES = ["Salary", "Freelance", "Food", "Travel", "Bills", "Shopping", "Health", "Other"];

const initialForm = {
  id: "",
  amount: "",
  type: "",
  category: "",
  date: "",
  description: "",
};

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value || 0);
}

function formatDate(isoDate) {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? isoDate : date.toLocaleDateString();
}

function monthKey(dateString) {
  return dateString ? dateString.slice(0, 7) : "";
}

function monthLabel(key) {
  if (!key || !key.includes("-")) return key;
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function escapeCsv(value) {
  const str = String(value ?? "");
  return `"${str.replaceAll('"', '""')}"`;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function loadStoredTransactions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadStoredBudget() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.budget) || "0");
    return typeof parsed === "number" ? parsed : 0;
  } catch {
    return 0;
  }
}

function loadStoredTheme() {
  return localStorage.getItem(STORAGE_KEYS.theme) || "light";
}

function App() {
  const [transactions, setTransactions] = useState(loadStoredTransactions);
  const [filters, setFilters] = useState({ type: "all", category: "all", month: "all", search: "" });
  const [budget, setBudget] = useState(loadStoredBudget);
  const [theme, setTheme] = useState(loadStoredTheme);
  const [formData, setFormData] = useState(initialForm);
  const [isEditing, setIsEditing] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.budget, JSON.stringify(budget));
  }, [budget]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
    document.body.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const availableMonths = useMemo(() => {
    return [...new Set(transactions.map((tx) => monthKey(tx.date)).filter(Boolean))].sort().reverse();
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const typeMatch = filters.type === "all" || tx.type === filters.type;
      const categoryMatch = filters.category === "all" || tx.category === filters.category;
      const monthMatch = filters.month === "all" || monthKey(tx.date) === filters.month;
      const searchMatch =
        !filters.search.trim() || (tx.description || "").toLowerCase().includes(filters.search.trim().toLowerCase());
      return typeMatch && categoryMatch && monthMatch && searchMatch;
    });
  }, [transactions, filters]);

  const summary = useMemo(() => {
    return filteredTransactions.reduce(
      (acc, tx) => {
        const amount = Number(tx.amount) || 0;
        if (tx.type === "income") acc.income += amount;
        if (tx.type === "expense") acc.expense += amount;
        return acc;
      },
      { income: 0, expense: 0 }
    );
  }, [filteredTransactions]);

  const balance = summary.income - summary.expense;
  const budgetPercentage = budget > 0 ? Math.min((summary.expense / budget) * 100, 100) : 0;
  const budgetExceeded = budget > 0 && summary.expense > budget;

  const expenseByCategory = useMemo(() => {
    const map = {};
    filteredTransactions.forEach((tx) => {
      if (tx.type === "expense") {
        map[tx.category] = (map[tx.category] || 0) + Number(tx.amount);
      }
    });
    return map;
  }, [filteredTransactions]);

  const expenseChartData = useMemo(() => {
    const labels = Object.keys(expenseByCategory);
    const values = Object.values(expenseByCategory);
    return {
      labels: labels.length ? labels : ["No Expenses"],
      datasets: [
        {
          data: values.length ? values : [1],
          backgroundColor: values.length
            ? ["#6366f1", "#14b8a6", "#f97316", "#84cc16", "#ec4899", "#06b6d4", "#f59e0b", "#8b5cf6"]
            : ["#9ca3af"],
        },
      ],
    };
  }, [expenseByCategory]);

  const comparisonData = useMemo(() => {
    return {
      labels: ["Income", "Expense"],
      datasets: [
        {
          label: "Amount",
          data: [summary.income, summary.expense],
          backgroundColor: ["#16a34a", "#dc2626"],
          borderRadius: 8,
        },
      ],
    };
  }, [summary]);

  useEffect(() => {
    if (!availableMonths.includes(filters.month) && filters.month !== "all") {
      setFilters((prev) => ({ ...prev, month: "all" }));
    }
  }, [availableMonths, filters.month]);

  function validateForm() {
    if (!formData.amount || Number(formData.amount) <= 0) return "Enter a valid amount greater than 0.";
    if (!formData.type || !["income", "expense"].includes(formData.type)) return "Select a valid transaction type.";
    if (!formData.category) return "Select a category.";
    if (!formData.date) return "Select a transaction date.";
    return "";
  }

  function handleSubmit(event) {
    event.preventDefault();
    setFormError("");

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const payload = {
      id: formData.id || createId(),
      amount: Number(formData.amount),
      type: formData.type,
      category: formData.category,
      date: formData.date,
      description: formData.description.trim(),
    };

    if (isEditing) {
      setTransactions((prev) => prev.map((tx) => (tx.id === payload.id ? payload : tx)));
    } else {
      setTransactions((prev) => [payload, ...prev]);
    }

    setFormData(initialForm);
    setIsEditing(false);
  }

  function handleDelete(id) {
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
    if (isEditing && formData.id === id) {
      setFormData(initialForm);
      setIsEditing(false);
    }
  }

  function handleEdit(id) {
    const tx = transactions.find((item) => item.id === id);
    if (!tx) return;
    setFormData({
      id: tx.id,
      amount: String(tx.amount),
      type: tx.type,
      category: tx.category,
      date: tx.date,
      description: tx.description || "",
    });
    setIsEditing(true);
    setFormError("");
  }

  function cancelEdit() {
    setFormData(initialForm);
    setIsEditing(false);
    setFormError("");
  }

  function exportAsJson() {
    downloadFile("finance-transactions.json", JSON.stringify(transactions, null, 2), "application/json");
  }

  function exportAsCsv() {
    const headers = ["id", "amount", "type", "category", "date", "description"];
    const rows = transactions.map((tx) => headers.map((h) => escapeCsv(tx[h])).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    downloadFile("finance-transactions.csv", csv, "text/csv;charset=utf-8;");
  }

  return (
    <>
      <header className="app-header">
        <h1>Personal Finance Tracker</h1>
        <div className="header-actions">
          <button className="btn-secondary" type="button" onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}>
            Toggle Dark Mode
          </button>
          <button className="btn-secondary" type="button" onClick={exportAsJson}>
            Export JSON
          </button>
          <button className="btn-secondary" type="button" onClick={exportAsCsv}>
            Export CSV
          </button>
        </div>
      </header>

      <main className="app-grid">
        <section className="card form-card">
          <h2>{isEditing ? "Edit Transaction" : "Add Transaction"}</h2>
          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="amount">Amount</label>
            <input
              id="amount"
              type="number"
              min="0.01"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
              required
            />

            <label htmlFor="type">Type</label>
            <select
              id="type"
              value={formData.type}
              onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value }))}
              required
            >
              <option value="">Select Type</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>

            <label htmlFor="category">Category</label>
            <select
              id="category"
              value={formData.category}
              onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
              required
            >
              <option value="">Select Category</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <label htmlFor="date">Date</label>
            <input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
              required
            />

            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              rows="3"
              placeholder="Optional note"
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            />

            <button className="btn-primary" type="submit">
              {isEditing ? "Update Transaction" : "Add Transaction"}
            </button>
            {isEditing && (
              <button className="btn-secondary" type="button" onClick={cancelEdit}>
                Cancel Edit
              </button>
            )}
            <p className="error-message" aria-live="polite">
              {formError}
            </p>
          </form>
        </section>

        <section className="card transactions-card">
          <div className="toolbar">
            <h2>Transactions</h2>
            <input
              type="search"
              placeholder="Search description..."
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            />
          </div>

          <div className="filters">
            <select value={filters.type} onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}>
              <option value="all">All Types</option>
              <option value="income">Income Only</option>
              <option value="expense">Expense Only</option>
            </select>

            <select value={filters.category} onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}>
              <option value="all">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select value={filters.month} onChange={(e) => setFilters((prev) => ({ ...prev, month: e.target.value }))}>
              <option value="all">All Months</option>
              {availableMonths.map((month) => (
                <option key={month} value={month}>
                  {monthLabel(month)}
                </option>
              ))}
            </select>
          </div>

          <ul className="transaction-list">
            {!filteredTransactions.length && <li className="meta">No transactions found.</li>}
            {filteredTransactions.map((tx) => (
              <li key={tx.id} className={`transaction-item ${tx.type}`}>
                <div className="transaction-top">
                  <strong>{tx.description || "(No description)"}</strong>
                  <span className={`amount ${tx.type}`}>
                    {tx.type === "income" ? "+" : "-"}
                    {formatCurrency(tx.amount)}
                  </span>
                </div>
                <div className="meta">
                  {tx.category} | {formatDate(tx.date)} | {tx.type}
                </div>
                <div className="item-actions">
                  <button type="button" onClick={() => handleEdit(tx.id)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(tx.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className={`card insights-card ${budgetExceeded ? "budget-warning" : ""}`}>
          <h2>Monthly Summary</h2>
          <div className="summary-cards">
            <article className="summary income">
              <h3>Total Income</h3>
              <p>{formatCurrency(summary.income)}</p>
            </article>
            <article className="summary expense">
              <h3>Total Expenses</h3>
              <p>{formatCurrency(summary.expense)}</p>
            </article>
            <article className="summary balance">
              <h3>Balance</h3>
              <p>{formatCurrency(balance)}</p>
            </article>
          </div>

          <div className="budget-section">
            <label htmlFor="monthlyBudget">Monthly Budget</label>
            <input
              id="monthlyBudget"
              type="number"
              min="0"
              step="0.01"
              placeholder="Set monthly budget"
              value={budget || ""}
              onChange={(e) => setBudget(Number(e.target.value) || 0)}
            />
            <div className="budget-progress-wrap">
              <div className="budget-progress-bar" style={{ width: `${budgetPercentage}%` }} />
            </div>
            <p className="budget-status">
              {budget <= 0
                ? "Set your monthly budget to monitor spending."
                : budgetExceeded
                ? `⚠ Budget Exceeded by ${formatCurrency(summary.expense - budget)}`
                : `${formatCurrency(summary.expense)} of ${formatCurrency(budget)} used`}
            </p>
          </div>

          <div className="chart-wrap">
            <h3>Expense Distribution</h3>
            <Pie data={expenseChartData} options={{ responsive: true, plugins: { legend: { position: "bottom" } } }} />
          </div>
          <div className="chart-wrap">
            <h3>Income vs Expense</h3>
            <Bar
              data={comparisonData}
              options={{
                responsive: true,
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { display: false } },
              }}
            />
          </div>
        </section>
      </main>
    </>
  );
}

export default App;
