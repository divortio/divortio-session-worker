# 🚀 Deployment Guide

This guide will walk you through deploying the `divortio-session-worker` from a GitHub repository using the Cloudflare
dashboard.

---

### Step 1: Fork and Clone the Repository

1. **Fork** this repository to your own GitHub account.
2. **Clone** your forked repository to your local machine.

---

### Step 2: Configure and Deploy from the Cloudflare Dashboard

1. **Navigate to Workers & Pages**: In the Cloudflare dashboard, go to `Workers & Pages`.
2. **Create Application**: Click "**Create application**", then select the "**Workers**" tab.
3. **Connect to Git**: Click "**Connect with Git**" and select the `divortio-session-worker` repository you forked.
4. **Configure Deployment**:
    * **Project Name**: Give your service a name (e.g., `divortio-session-worker-prod`).
    * **Production Branch**: Ensure this is set to `main`.
    * Click "**Save and Deploy**".

---

### Step 3: Configure Bindings

After the initial deployment succeeds, you must configure the necessary bindings for the worker to be fully functional.

1. Navigate to your new worker's **`Settings`** tab > **`Variables`**.
2. **Durable Object Binding**:
    * Scroll down to **Durable Object Bindings** and click "**Add binding**".
    * **Variable name**: `SESSION_DO`
    * **Durable Object class**: `SessionDO`
3. **Analytics Engine Binding**:
    * Scroll down to **Analytics Engine Bindings** and click "**Add binding**".
    * **Variable name**: `ANALYTICS`
    * **Dataset name**: `session_events` (or a name of your choice).
4. **Save and Redeploy**:
    * Click "**Save**" at the bottom of the page.
    * Navigate to the "**Deployments**" tab and click "**Deploy**" to apply the binding changes.

Your `divortio-session-worker` is now live and ready to be used by other workers.