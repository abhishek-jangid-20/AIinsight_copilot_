/**
 * ---------------------------------------------------------
 * Folder: components/
 * Location: client/src/components/
 * ---------------------------------------------------------
 *
 * Folder Purpose:
 *   The `components` folder houses reusable, self-contained UI modules and layout panels.
 *   These components structure the presentation layer of the application.
 *
 * ---------------------------------------------------------
 * Component: AuthPanel
 * ---------------------------------------------------------
 *
 * Purpose:
 *   Manages the user authentication gate, allowing users to register a new account
 *   or sign in to their existing account to acquire a JWT token.
 *
 * Responsibilities:
 * - Directs the inputs for Name (signup only), Email, and Password.
 * - Switches view configurations dynamically between "login" and "signup" states.
 * - Displays client/server authentication error messages.
 * - Dispatches successful credentials payload to the Redux store to trigger App.jsx entry.
 *
 * Props:
 *   None. (Acts as a full-page route-level layout wrapper when unauthenticated)
 *
 * State:
 * - mode ("login" | "signup"): Controls visual form mode.
 * - name (string): Controlled component state for registration naming.
 * - email (string): Controlled component state for email addresses.
 * - password (string): Controlled component state for passwords.
 * - showPw (boolean): Toggles the password field type parameter (text vs password).
 *
 * Lifecycle / Hooks:
 * 1. useDispatch: Obtains the Redux dispatcher to commit signedIn payloads upon success.
 * 2. useMutation: Configures the asynchronous login/signup API queries, dispatching to the store when successful.
 *
 * Example Flow:
 * User enters credentials -> Clicks Sign In
 * ↓
 * Form onSubmit triggers
 * ↓
 * preventDefault prevents page reload
 * ↓
 * mutation.mutate() fires API request (login/signup)
 * ↓
 * Server returns response
 *   - If Success: dispatch(signedIn(payload)) updates Redux store -> App.jsx re-renders dashboard.
 *   - If Failure: mutation.error sets error state -> Error banner appears in UI.
 *
 * Related Files:
 * - client/src/lib/api.js (Exports backend login/signup API calls)
 * - client/src/app/store.js (Redux signedIn dispatcher action)
 * - client/src/App.jsx (Listens to token changes to render workspace vs AuthPanel)
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BrainCircuit, Eye, EyeOff } from "lucide-react";
import { useDispatch } from "react-redux";
import { login, signup } from "../lib/api";
import { signedIn } from "../app/store";

export function AuthPanel() {
  const dispatch = useDispatch();

  // Local UI State
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  /**
   * =============================================================================
   * REACT CONCEPT: useMutation
   * =============================================================================
   * Definition:
   *   A TanStack Query hook that manages asynchronous server modification actions
   *   (creates, updates, deletes) and tracks loading/error states.
   *
   * Why it is used here:
   *   Handles the network request to either login or signup. It tracks `isPending`
   *   so we can show loading spinners and disable submit buttons. On success, it
   *   dispatches authentication details to the global store.
   *
   * References:
   * - https://tanstack.com/query/v5/docs/framework/react/reference/useMutation
   */
  const mutation = useMutation({
    mutationFn: () => (mode === "login" ? login(email, password) : signup(name, email, password)),
    onSuccess: (payload) => dispatch(signedIn(payload)),
  });

  return (
    <main className="relative min-h-screen flex items-center justify-center px-5 overflow-hidden"
      style={{ background: "linear-gradient(165deg, #060a12 0%, #07091a 35%, #080d1a 60%, #060a14 100%)" }}>

      {/* Aesthetic Background Glow Orbs */}
      <div className="pointer-events-none fixed" style={{
        top: "-120px", left: "-120px",
        width: "500px", height: "500px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(67,217,255,0.18) 0%, transparent 65%)",
        filter: "blur(60px)",
        opacity: 0.6
      }} />
      <div className="pointer-events-none fixed" style={{
        bottom: "-100px", right: "-100px",
        width: "450px", height: "450px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(98,245,198,0.14) 0%, transparent 65%)",
        filter: "blur(60px)",
        opacity: 0.5
      }} />
      <div className="pointer-events-none fixed" style={{
        top: "50%", left: "60%",
        width: "300px", height: "300px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(139,115,255,0.08) 0%, transparent 65%)",
        filter: "blur(50px)",
        opacity: 0.5
      }} />

      {/* =======================================================================
         Authentication Form Card
         Employs onSubmit with preventDefault to manage submissions via React.
      ======================================================================= */}
      <form
        className="relative z-10 w-full"
        style={{ maxWidth: "420px" }}
        onSubmit={(e) => {
          /**
           * ===================================================================
           * REACT CONCEPT: Form onSubmit & preventDefault
           * ===================================================================
           * Why?
           *   Standard HTML form submissions attempt to reload the browser window
           *   to send variables to the URL/server. `preventDefault()` stops this
           *   default browser reload, allowing React to handle authentication
           *   asynchronously using Javascript API calls.
           *
           * References:
           * - https://react.dev/reference/react-dom/components/input#controlling-an-input-with-a-state-variable
           */
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="rounded-2xl px-8 py-10"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
            border: "1px solid rgba(29,42,66,0.7)",
            backdropFilter: "blur(24px)",
            boxShadow: "0 8px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)"
          }}>

          {/* Logo Title section */}
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl"
              style={{
                background: "linear-gradient(135deg, rgba(67,217,255,0.12), rgba(98,245,198,0.06))",
                border: "1px solid rgba(67,217,255,0.22)",
                color: "#43d9ff",
                boxShadow: "0 0 28px rgba(67,217,255,0.14), 0 0 0 1px rgba(67,217,255,0.06)"
              }}>
              <BrainCircuit size={30} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{
                background: "linear-gradient(135deg, #43d9ff 0%, #62f5c6 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text"
              }}>
                CodeInsight AI
              </h1>
              <p className="mt-1 text-sm" style={{ color: "#475569" }}>
                {mode === "login" ? "Sign in to your repository cockpit." : "Create a new account to get started."}
              </p>
            </div>
          </div>

          {/* Mode Switch Tabs (Login vs Sign Up) */}
          <div className="mb-6 grid grid-cols-2 gap-1 p-1 rounded-xl"
            style={{ background: "rgba(6,10,18,0.7)", border: "1px solid rgba(29,42,66,0.6)" }}>
            {["login", "signup"].map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setMode(item)}
                className="h-9 rounded-lg text-sm font-semibold transition-all duration-200"
                style={mode === item ? {
                  background: "linear-gradient(135deg, #43d9ff, #62f5c6)",
                  color: "#060a12",
                  boxShadow: "0 0 14px rgba(67,217,255,0.2)"
                } : {
                  color: "#475569",
                  background: "transparent"
                }}
              >
                {item === "login" ? "Login" : "Sign Up"}
              </button>
            ))}
          </div>

          {/* Input Fields Container */}
          <div className="flex flex-col gap-1">
            {/* =================================================================
               Conditional Rendering
               The Name field is only rendered if we are in signup mode.
            ================================================================= */}
            {mode === "signup" && (
              <Field label="Name" value={name} onChange={setName} placeholder="Your name" />
            )}
            
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
            
            <Field
              label="Password"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="transition"
                  style={{ color: "#334155", lineHeight: 1 }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#43d9ff"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "#334155"; }}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
            />
          </div>

          {/* Server Error Alert Banner */}
          {mutation.error && (
            <div className="mt-4 px-3 py-2.5 rounded-xl text-xs"
              style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.22)", color: "#f87171" }}>
              {mutation.error.message}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={mutation.isPending}
            className="mt-6 h-11 w-full rounded-xl font-bold text-[13px] transition-all flex items-center justify-center gap-2"
            style={{
              background: mutation.isPending
                ? "rgba(67,217,255,0.4)"
                : "linear-gradient(135deg, #43d9ff 0%, #62f5c6 100%)",
              color: "#060a12",
              boxShadow: mutation.isPending ? "none" : "0 0 20px rgba(67,217,255,0.25)",
              opacity: mutation.isPending ? 0.7 : 1,
              cursor: mutation.isPending ? "not-allowed" : "pointer"
            }}
          >
            {mutation.isPending ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2"
                  style={{ borderColor: "rgba(6,10,18,0.25)", borderTopColor: "#060a12" }} />
                {mode === "login" ? "Signing in…" : "Creating account…"}
              </>
            ) : mode === "login" ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </button>

          {/* Footer Subtext */}
          <p className="mt-5 text-center text-[11px]" style={{ color: "#2d3748" }}>
            Secured with JWT · Repository data stays local
          </p>
        </div>
      </form>
    </main>
  );
}

// =============================================================================
// Component: Field
// =============================================================================
/**
 * Renders a standardized, customizable input form control.
 *
 * Why React composition is useful:
 *   Instead of copying style settings and layout logic for Name, Email, and
 *   Password inputs, we compose a single reusable `<Field />` control to ensure design
 *   consistency.
 *
 * Props:
 * - label: Text rendering above the input box (e.g. "Password").
 * - value: Value binding mapping to parent controlled state.
 * - onChange: Callback firing to modify parent states when typed text changes.
 * - type: HTML input type (text, email, password, etc.).
 * - placeholder: Temporary placeholder string.
 * - suffix: Optional React element (e.g., eye toggle icon) positioned inside the right end.
 */
function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  suffix,
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#334155" }}>
        {label}
      </span>
      <div className="relative">
        {/**
         * =====================================================================
         * REACT CONCEPT: Controlled Components
         * =====================================================================
         * Definition:
         *   An input element whose value is fully controlled by React local state.
         *   The local state acts as the "single source of truth".
         *
         * How it works:
         *   - `value={value}` forces the input text to match current state.
         *   - `onChange={...}` captures keystrokes and updates parent state,
         *     causing a re-render to update the display.
         *
         * References:
         * - https://react.dev/learn/sharing-state-between-components#controlled-and-uncontrolled-components
         */}
        <input
          className="h-11 w-full rounded-xl px-3 text-sm transition-all"
          style={{
            background: "rgba(6,10,18,0.7)",
            border: "1px solid rgba(29,42,66,0.8)",
            color: "#e2e8f4",
            outline: "none",
            paddingRight: suffix ? "40px" : undefined
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = "rgba(67,217,255,0.4)";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(67,217,255,0.07)";
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = "rgba(29,42,66,0.8)";
            e.currentTarget.style.boxShadow = "";
          }}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {suffix}
          </div>
        )}
      </div>
    </label>
  );
}
