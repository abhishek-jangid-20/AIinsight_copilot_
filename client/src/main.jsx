/**
 * ---------------------------------------------------------
 * File: main.jsx
 * Location: client/src/main.jsx
 * ---------------------------------------------------------
 *
 * Folder Purpose:
 * client/src/
 *   This is the root folder for the frontend codebase, containing all the React
 *   components, features, state management slices, assets, styles, and helpers.
 *
 * Purpose of this File:
 *   This is the entry point of the React application. It bootstraps the React app
 *   by finding the root HTML DOM element and rendering the top-level application tree.
 *   It sets up critical global providers like Redux (for UI state) and TanStack Query
 *   (for server state and caching) so that they wrap the entire app.
 *
 * Responsibilities:
 * - Bootstraps the application into the DOM using React 18 ReactDOM.createRoot.
 * - Wraps the application in <React.StrictMode> to capture potential lifecycle bugs during development.
 * - Inject the global Redux store using <Provider>.
 * - Initialize and inject the React Query (TanStack Query) client using <QueryClientProvider>.
 * - Import global styles (styles.css).
 *
 * Related Files:
 * - client/src/App.jsx (The root layout/shell component)
 * - client/src/app/store.js (Global Redux state configuration)
 * - client/src/styles.css (Global design system styles)
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { store } from "./app/store";
import "./styles.css";

/**
 * =============================================================================
 * REACT CONCEPT: TanStack Query (React Query) - QueryClient
 * =============================================================================
 * Definition:
 *   QueryClient is the class that manages the cache, query states, and mutations
 *   representing server data in TanStack Query.
 *
 * Why it is used here:
 *   It serves as the centralized cache coordinator. All API requests for repositories,
 *   chats, and search results go through this client, which handles caching, refetching,
 *   and garbage collection.
 *
 * Alternative approaches:
 *   - Fetching in useEffect and saving to a Redux store or local useState.
 *     Disadvantage: Requires manually writing caching logic, deduping requests, handling loading/error states.
 *   - RTK Query (Redux Toolkit's built-in query system).
 *     Advantage: Fully integrated with Redux.
 *     Disadvantage: Slightly steeper learning curve and configuration overhead than TanStack Query.
 *
 * Best practices:
 *   - Initialize the QueryClient once outside the component render tree to avoid recreating
 *     the cache on re-renders.
 *
 * References:
 * - https://tanstack.com/query/v5/docs/framework/react/reference/QueryClient
 */
const queryClient = new QueryClient();

/**
 * =============================================================================
 * REACT CONCEPT: ReactDOM.createRoot & Bootstrapping
 * =============================================================================
 * Definition:
 *   React 18 entry point API. It receives a DOM container element and creates a React
 *   root container, enabling React's Concurrent features (like transitions and Suspense).
 *
 * How it works:
 *   1. document.getElementById("root") grabs the empty <div id="root"> from public/index.html.
 *   2. ReactDOM.createRoot creates the React fiber container.
 *   3. .render(...) mounts the JSX component tree onto the DOM.
 *
 * References:
 * - https://react.dev/reference/react-dom/client/createRoot
 */
ReactDOM.createRoot(document.getElementById("root")).render(
  /**
   * =============================================================================
   * REACT CONCEPT: React.StrictMode
   * =============================================================================
   * Definition:
   *   A helper component that checks for potential problems in the app. It does not
   *   render any visible UI. It activates checks and logs warnings for its children.
   *
   * Why it is used here:
   *   During development, it helps locate side effects in component life cycles
   *   by intentionally double-rendering components (calling render, constructor, etc., twice).
   *
   * Advantages:
   *   - Identifies components with unsafe lifecycles.
   *   - Warns about legacy API usage.
   *   - Catches memory leaks by double-calling effects (setup -> cleanup -> setup).
   *
   * Disadvantages:
   *   - Re-renders everything twice in development, which can confuse developers debugging console.logs.
   *   - Has no effect in production build (safe performance-wise).
   *
   * References:
   * - https://react.dev/reference/react/StrictMode
   */
  <React.StrictMode>
    {/**
     * =========================================================================
     * REACT CONCEPT: Redux Provider
     * =========================================================================
     * Definition:
     *   The component provided by react-redux that makes the Redux store available
     *   to any nested components that need to access state or dispatch actions.
     *
     * Why it is used here:
     *   It hosts our global auth token and user state. Any component in the app
     *   can use useSelector() or useDispatch() to read or update authentication credentials.
     *
     * Alternative approaches:
     *   - React Context API.
     *     Advantage: Built-in to React, no third-party package needed.
     *     Disadvantage: Can cause unnecessary re-renders of the entire consumer tree unless optimized.
     *   - Zustand.
     *     Advantage: Extremely lightweight, zero boilerplate, no provider wraps needed.
     *
     * References:
     * - https://react-redux.js.org/api/provider
     */}
    <Provider store={store}>
      {/**
       * =======================================================================
       * REACT CONCEPT: QueryClientProvider
       * =======================================================================
       * Definition:
       *   Wraps the tree and hooks up the QueryClient cache instance using React Context,
       *   making it accessible to hooks like useQuery and useMutation anywhere.
       *
       * References:
       * - https://tanstack.com/query/v5/docs/framework/react/reference/QueryClientProvider
       */}
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>
);
