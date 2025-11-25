# Jasper

**Jasper** is a robust Discord bot built using the [Sapphire Framework](https://www.sapphirejs.dev/) and [Prisma](https://www.prisma.io/). It utilizes TypeScript for type safety and modern development standards.

## 🚀 Features

-   **Framework**: Built on Sapphire for modular command and event handling.
-   **Database**: Uses Prisma ORM for type-safe database interactions.
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
```

### Production
For production environments, build the TypeScript code and run the compiled JavaScript:

```bash
# Build the project
npm run build

# Start the bot
npm start
```

## 🏗️ Code Overview

This project follows a service-oriented architecture using Sapphire's dependency injection system.

-   **Entry Point (`src/index.ts`)**: 
    -   Initializes the `SapphireClient`.
    -   Connects to the database using `ensureDatabaseReady`.
    -   Registers global services (e.g., `GuildSettingsService`, `SlowmodeManager`) into the `container`.
-   **Services (`src/services/`)**: 
    -   Contains the core business logic.
    -   Examples: `SupportThreadService` handles logic for support threads, while `GuildSettingsService` manages per-guild configurations.
-   **Database (`src/lib/database.ts`)**: 
    -   Exports the Prisma client wrapper.
    -   Accessible globally via `container.database`.
-   **Standard Sapphire Components**:
    -   **Commands**: Located in `src/commands`.
    -   **Listeners**: Located in `src/listeners`.
    -   **Interaction Handlers**: Located in `src/interaction-handlers`.

## 🗄️ Database Commands

The `package.json` includes several helper scripts for database management:

-   `npm run db:generate`: Generates the Prisma client based on your schema.
-   `npm run db:migrate`: Applies migrations to your development database.
-   `npm run db:studio`: Opens Prisma Studio in your browser to view/edit data.
-   `npm run db:reset`: Resets the database (Caution: deletes data).

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check the [issues page](https://github.com/GuikiPT/JasperRevamp/issues).

## 📝 License

This project is licensed under the [Unlicense](LICENSE).
