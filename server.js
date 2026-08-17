require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const { MongoClient } = require("mongodb");
const { seedConfig, seedLeads } = require("./seed-data");

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error(
    "MONGODB_URI is required. Copy .env.example to .env and add it.",
  );
}

const client = new MongoClient(mongoUri);
let db;

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8,
    },
    store: MongoStore.create({
      mongoUrl: mongoUri,
      collectionName: "sessions",
    }),
  }),
);

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin)
    return res.status(401).json({ error: "Please log in to continue." });
  next();
}

async function getConfig() {
  return db.collection("config").findOne({ key: "current" });
}

function optionFor(config, key, answer) {
  const question = config.questions.find((item) => item.key === key);
  return (
    question &&
    question.options &&
    question.options.find((option) => option.value === String(answer))
  );
}

function validateAnswers(config, answers) {
  const errors = {};
  config.questions
    .filter((question) => question.active)
    .forEach((question) => {
      const answer = answers[question.key];
      if (
        question.required &&
        (answer === undefined || answer === null || answer === "")
      )
        errors[question.key] = "This question is required.";
      if (question.type === "number" && answer !== undefined && answer !== "") {
        const number = Number(answer);
        if (
          !Number.isFinite(number) ||
          number < question.min ||
          number > question.max
        )
          errors[question.key] =
            `Enter a number between ${question.min} and ${question.max}.`;
      }
      if (
        question.type === "select" &&
        answer !== undefined &&
        !optionFor(config, question.key, answer)
      )
        errors[question.key] = "Please select a valid option.";
    });
  return errors;
}

function calculateEstimate(config, answers) {
  const area = Number(answers.roof_area);
  const material = optionFor(config, "material", answers.material);
  const pitch = optionFor(config, "pitch", answers.pitch);
  const layers = optionFor(config, "layers", answers.layers);
  const stories = optionFor(config, "stories", answers.stories);
  const materialCost =
    area *
    Number(material.rate_per_sqft) *
    (1 + Number(config.modifiers.waste_factor));
  const tearOff = area * Number(layers.tear_off_per_sqft || 0);
  const subtotal =
    (materialCost + tearOff) *
    Number(pitch.multiplier || 1) *
    Number(stories.multiplier || 1);
  const midpoint = subtotal + Number(config.modifiers.permit_flat_fee);
  const spread = Number(config.modifiers.range_spread_pct) / 100;
  return {
    estimate_low: Math.round(midpoint * (1 - spread)),
    estimate_high: Math.round(midpoint * (1 + spread)),
  };
}

app.get("/api/config", async (req, res, next) => {
  try {
    const config = await getConfig();
    res.json({
      config_version: config.config_version,
      business: config.business,
      questions: config.questions
        .filter((q) => q.active)
        .sort((a, b) => a.order - b.order),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/estimate", async (req, res, next) => {
  try {
    const { name, phone, email, answers = {} } = req.body;
    const contactErrors = {};
    if (!String(name || "").trim()) contactErrors.name = "Name is required.";
    if (!String(phone || "").trim()) contactErrors.phone = "Phone is required.";
    if (!/^\S+@\S+\.\S+$/.test(String(email || "")))
      contactErrors.email = "Enter a valid email address.";
    const config = await getConfig();
    const errors = { ...contactErrors, ...validateAnswers(config, answers) };
    if (Object.keys(errors).length)
      return res
        .status(400)
        .json({ error: "Please review the highlighted fields.", errors });
    const estimate = calculateEstimate(config, answers);
    const lead = {
      id: `ld_${Date.now()}`,
      captured_at: new Date(),
      config_version: config.config_version,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      answers,
      ...estimate,
    };
    await db.collection("leads").insertOne(lead);
    res.status(201).json({ ...estimate, currency: config.business.currency });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USERNAME || "admin";
  const validPassword = process.env.ADMIN_PASSWORD || "roofing2026!";
  if (username !== validUser || password !== validPassword)
    return res.status(401).json({ error: "Incorrect username or password." });
  req.session.isAdmin = true;
  res.json({ ok: true });
});
app.post("/api/auth/logout", (req, res) =>
  req.session.destroy(() => res.json({ ok: true })),
);
app.get("/api/admin/config", requireAdmin, async (req, res, next) => {
  try {
    res.json(await getConfig());
  } catch (error) {
    next(error);
  }
});
app.put("/api/admin/config", requireAdmin, async (req, res, next) => {
  try {
    // The browser receives MongoDB's _id in the GET response. Never include it
    // in a replacement document because MongoDB does not allow _id to change.
    const { _id, ...config } = req.body;
    if (
      !Array.isArray(config.questions) ||
      !config.business ||
      !config.modifiers
    )
      return res.status(400).json({ error: "Invalid configuration." });
    config.questions.forEach((question, index) => {
      question.order = index + 1;
      question.active = Boolean(question.active);
    });
    config.config_version = (await getConfig()).config_version + 1;
    config.key = "current";
    config.updated_at = new Date();
    await db
      .collection("config")
      .replaceOne({ key: "current" }, config, { upsert: true });
    res.json(config);
  } catch (error) {
    next(error);
  }
});
app.get("/api/admin/leads", requireAdmin, async (req, res, next) => {
  try {
    res.json(
      await db.collection("leads").find().sort({ captured_at: -1 }).toArray(),
    );
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html")),
);
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

async function start() {
  await client.connect();
  db = client.db();
  if (!(await db.collection("config").findOne({ key: "current" }))) {
    await db
      .collection("config")
      .insertOne({ key: "current", ...seedConfig, created_at: new Date() });
    await db.collection("leads").insertMany(seedLeads);
    console.log("Database seeded.");
  }
  app.listen(port, () =>
    console.log(`Northline estimator running on http://localhost:${port}`),
  );
}
start().catch((error) => {
  console.error("Could not start server:", error);
  process.exit(1);
});
