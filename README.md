# Jasper

**Jasper** is a robust Discord bot made for NoTextToSpeech Server built using the [Sapphire Framework](https://www.sapphirejs.dev/) and [Prisma](https://www.prisma.io/).

It utilizes TypeScript for type safety and modern development standards.

## 🚀 Features

-   **Framework**: It is built on SapphireJS for modular command and event handling, using a custom made subcommand handling system to load subcommands dinamically.
-   **Database**: Uses Prisma ORM for type-safe database interactions and migrations scripts.
-   **Language**: Written completely in TypeScript.
-   **Service-Oriented**: Business logic is separated into injectable services.

## 📋 Prerequisites

Before you begin, ensure you have met the following requirements:

-   **Node.js**: v20 or higher.
-   **Database**: A database supported by Prisma (PostgreSQL is recommended, but works with MySQL, SQLite, etc.).

## 🛠️ Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/GuikiPT/JasperRevamp.git
    cd JasperRevamp
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configuration**:
    Create a `.env` file in the root directory. You can use `.env.example` as a reference if available, or add the following:

    ```env
    # Discord Bot Token
    DISCORD_TOKEN=your_discord_bot_token_here

    # Database Connection URL (Example for PostgreSQL)
    DATABASE_URL="postgresql://user:password@localhost:5432/jasper_db?schema=public"

    # Sapphire specific (Optional)
    NODE_ENV=development
    ```

4.  **Database Setup**:
    Initialize your database schema using Prisma.
    
    ```bash
    # Generate Prisma Client
    npm run db:generate

    # Push schema to the database (for development)
    npm run db:migrate
    
    # (Optional) Seed the database if seed script is configured
    npm run db:seed
    ```

## 💻 Running the Bot

### Development
To run the bot in development mode with hot-reloading (restarts on file changes):

```bash
npm run watch:start
