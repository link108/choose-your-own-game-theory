import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api, authToken, User } from "./api";

type AuthState = {
  user: User | null;
  // false until the stored token has been checked, so pages can tell
  // "signed out" from "still loading"
  ready: boolean;
  signIn: (mode: "login" | "register", email: string, password: string) => Promise<User>;
  signOut: () => void;
};

const AuthContext = createContext<AuthState>({
  user: null,
  ready: false,
  signIn: async () => {
    throw new Error("auth not initialized");
  },
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!authToken.get()) {
      setReady(true);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => {
        // stale or revoked token; drop back to guest
        authToken.clear();
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback(
    async (mode: "login" | "register", email: string, password: string) => {
      const res =
        mode === "login" ? await api.login(email, password) : await api.register(email, password);
      authToken.set(res.token);
      setUser(res.user);
      return res.user;
    },
    [],
  );

  const signOut = useCallback(() => {
    authToken.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
