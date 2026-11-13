import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setToken, setUnauthorizedHandler, type Me } from "./api";

interface AuthState {
  ready: boolean;
  email: string | null;
  signedIn: boolean;
  /** plano e saldo de créditos (null até carregar) */
  me: Me | null;
  /** true logo depois de criar a conta: leva o usuário à tela de planos */
  onboarding: boolean;
  signIn(email: string, password: string, register: boolean): Promise<void>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
  finishOnboarding(): void;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(Ctx);

const KEY = "wheelai.session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [onboarding, setOnboarding] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch {}
  }, []);

  const signOut = useCallback(async () => {
    setToken(null);
    setEmail(null);
    setMe(null);
    setOnboarding(false);
    await SecureStore.deleteItemAsync(KEY).catch(() => {});
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut());
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(KEY);
        if (raw) {
          const s = JSON.parse(raw);
          setToken(s.token);
          setEmail(s.email);
          void refresh();
        }
      } catch {}
      setReady(true);
    })();
  }, [signOut, refresh]);

  const signIn = useCallback(
    async (e: string, p: string, register: boolean) => {
      const r = await (register ? api.register(e, p) : api.login(e, p));
      setToken(r.token);
      setEmail(r.email);
      setOnboarding(register); // conta nova -> mostra os planos
      await SecureStore.setItemAsync(KEY, JSON.stringify(r)).catch(() => {});
      void refresh();
    },
    [refresh],
  );

  const finishOnboarding = useCallback(() => setOnboarding(false), []);

  const value = useMemo(
    () => ({ ready, email, signedIn: !!email, me, onboarding, signIn, signOut, refresh, finishOnboarding }),
    [ready, email, me, onboarding, signIn, signOut, refresh, finishOnboarding],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
