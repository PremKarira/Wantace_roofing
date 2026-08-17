# Northline Roofing Estimator

A deliberately simple full-stack estimator for Northline Roofing & Exteriors. It has a public mobile-friendly estimator and a protected owner panel. Both share an Express API and MongoDB database.

## Features

- Public multi-step estimate form that fetches its active questions, labels, options, limits, and rates from MongoDB at runtime.
- Server-side validation and estimate calculation. Pricing never reaches the browser as calculation code.
- MongoDB persistence for configuration, sessions, historical seed leads, and newly captured leads.
- Owner login, editable labels and option rates, question on/off switches, editable modifiers, and a lead table.
- First startup seeds the provided production configuration and three historical leads only if no config exists.

## Stack

- Node.js + Express
- MongoDB Atlas using the official MongoDB driver
- Plain HTML, CSS, and browser JavaScript (no build step)

## Run locally

1. Install Node.js 18 or newer.
2. Clone the repository and enter its directory.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Set `MONGODB_URI` in `.env` to an Atlas connection string. The database part of a MongoDB URI must be a valid database name with no spaces; use a name such as `northline_roofing` rather than `project name`.
6. Set a unique `SESSION_SECRET`.
7. Run `npm start` and open `http://localhost:3000`.

For development with a supported recent Node version, run `npm run dev`.

## Environment variables

| Variable         | Required          | Purpose                                                |
| ---------------- | ----------------- | ------------------------------------------------------ |
| `MONGODB_URI`    | Yes               | MongoDB Atlas connection URI including a database name |
| `SESSION_SECRET` | Yes in production | Secret used to sign owner sessions                     |
| `ADMIN_USERNAME` | No                | Owner login username; defaults to `admin`              |
| `ADMIN_PASSWORD` | No                | Owner login password; defaults to `roofing2026!`       |
| `PORT`           | No                | HTTP port; defaults to `3000`                          |

## Test owner login

- Username: `admin`
- Password: `roofing2026!`

Change these through environment variables before deploying.

## Routes

| Route                           | Purpose                                    |
| ------------------------------- | ------------------------------------------ |
| `/`                             | Public estimator                           |
| `/admin.html`                   | Protected owner panel                      |
| `GET /api/config`               | Public active configuration                |
| `POST /api/estimate`            | Validates, calculates, and stores a lead   |
| `POST /api/auth/login`          | Creates owner session                      |
| `GET` / `PUT /api/admin/config` | Protected configuration access and updates |
| `GET /api/admin/leads`          | Protected lead list                        |

## Deployment notes

Set the environment variables in the host dashboard, deploy the repository, and ensure the MongoDB Atlas network-access settings allow the host to connect. On a HTTPS host, set `NODE_ENV=production` so the owner session cookie is marked secure.

## Manual acceptance check

1. Load the public page and complete the estimator; an estimate range should appear.
2. In a different browser session, open `/admin.html`; it should require login.
3. Sign in, change an option rate, and save.
4. Reload the public estimator and submit the same answers: the estimate should change without a server restart or frontend redeploy.
5. Return to the Leads tab and confirm the new inquiry and saved answers are present.
