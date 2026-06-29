import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AuthUser } from "../lib/api";
import { getToken, setToken } from "../lib/api";

interface AuthState {
  token: string | null;
  user: AuthUser | null;
}

const initialState: AuthState = { token: getToken(), user: null };

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    signedIn(state, action: PayloadAction<{ token: string; user: AuthUser }>) {
      state.token = action.payload.token;
      state.user = action.payload.user;
      setToken(action.payload.token);
    },
    signedOut(state) {
      state.token = null;
      state.user = null;
      setToken(null);
    }
  }
});

export const { signedIn, signedOut } = authSlice.actions;
export const store = configureStore({ reducer: { auth: authSlice.reducer } });
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
