import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, LockKeyhole, ShieldCheck, UserRoundPlus } from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import "./login.css";

type Mode = "login" | "register";

function getReturnPath() {
  const requested = new URLSearchParams(window.location.search).get("returnTo");
  if (!requested || !requested.startsWith("/") || requested.startsWith("//")) {
    return "/";
  }
  return requested;
}

export default function Login() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const login = trpc.auth.login.useMutation();
  const register = trpc.auth.register.useMutation();
  const pending = login.isPending || register.isPending;

  useEffect(() => {
    if (me.data) setLocation(getReturnPath());
  }, [me.data, setLocation]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (mode === "register") {
        await register.mutateAsync({ name, email, password });
      } else {
        await login.mutateAsync({ email, password });
      }
      await utils.auth.me.invalidate();
      await utils.auth.me.fetch();
      toast.success(mode === "register" ? "Conta criada com sucesso." : "Login realizado.");
      setLocation(getReturnPath());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível entrar.");
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <Link href="/" className="login-back">
          <ArrowLeft size={16} /> Voltar ao campeonato
        </Link>
        <div className="login-brand">
          <span><LockKeyhole size={23} /></span>
          <p className="eyebrow">SUPER COPA PIONNER</p>
        </div>
        <h1>{mode === "login" ? "Acesse sua conta" : "Crie sua conta"}</h1>
        <p className="login-description">
          {mode === "login"
            ? "Entre com seu e-mail e senha para continuar."
            : "Cadastre seus dados para acompanhar suas inscrições."}
        </p>
        <div className="login-tabs" role="tablist" aria-label="Acesso à conta">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Criar conta
          </button>
        </div>
        <form className="login-form" onSubmit={submit}>
          {mode === "register" && (
            <label>
              Nome
              <input
                autoComplete="name"
                value={name}
                onChange={event => setName(event.target.value)}
                minLength={2}
                maxLength={120}
                required
              />
            </label>
          )}
          <label>
            E-mail
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              maxLength={320}
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={event => setPassword(event.target.value)}
              minLength={mode === "register" ? 8 : 1}
              maxLength={128}
              required
            />
            {mode === "register" && <small>Use pelo menos 8 caracteres.</small>}
          </label>
          <button className="login-submit" type="submit" disabled={pending}>
            {mode === "login" ? <LockKeyhole size={17} /> : <UserRoundPlus size={17} />}
            {pending
              ? "Aguarde..."
              : mode === "login"
                ? "Entrar"
                : "Criar conta"}
          </button>
        </form>
        <p className="login-security">
          <ShieldCheck size={15} />
          Sua senha é armazenada de forma protegida.
        </p>
      </section>
    </main>
  );
}
