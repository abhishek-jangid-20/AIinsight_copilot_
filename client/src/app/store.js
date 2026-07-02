import { configureStore, createSlice } from "@reduxjs/toolkit";
import { getToken, setToken } from "../lib/api";

const initialState = { token: getToken(), user: null };

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    signedIn(state, action) {
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
