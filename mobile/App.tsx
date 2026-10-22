import { StatusBar } from "expo-status-bar"
import * as Linking from "expo-linking"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import type { User } from "@supabase/supabase-js"
import {
  authErrorMessage,
  authLinkErrorCode,
  loginBanner,
  validateForgotPassword,
  validatePasswordReset,
  validateSignIn,
  validateSignUp,
  type FieldErrors,
} from "../src/lib/auth"
import { supabase } from "./src/supabase"

type Screen = "loading" | "config" | "login" | "register" | "forgot" | "reset" | "home" | "offline"

const OTP_TYPES = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"])

function fieldError(errors: FieldErrors, key: keyof FieldErrors) {
  return errors[key] ?? null
}

export default function App() {
  const redirectTo = useMemo(() => Linking.createURL("auth/callback"), [])
  const [screen, setScreen] = useState<Screen>(supabase ? "loading" : "config")
  const [attempt, setAttempt] = useState(0)
  const [user, setUser] = useState<User | null>(null)
  const [profileName, setProfileName] = useState("")
  const [profileNote, setProfileNote] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let active = true

    async function restore() {
      const { data, error } = await supabase!.auth.getSession()
      if (!active) return
      if (error) {
        setBanner(authErrorMessage(error, "session"))
        setScreen("offline")
        return
      }
      if (!data.session) {
        setScreen((current) => (current === "loading" ? "login" : current))
        return
      }
      const verified = await supabase!.auth.getUser()
      if (!active) return
      if (verified.error || !verified.data.user) {
        setBanner(verified.error ? authErrorMessage(verified.error, "session") : "The saved session could not be confirmed.")
        setScreen("offline")
        return
      }
      setUser(verified.data.user)
      await loadProfile(verified.data.user)
      if (active) setScreen((current) => (current === "loading" ? "home" : current))
    }

    void restore()
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null)
        setProfileName("")
      }
    })
    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [attempt])

  useEffect(() => {
    if (!supabase) return
    const handle = async (url: string | null) => {
      if (!url) return
      const parsed = Linking.parse(url)
      const code = typeof parsed.queryParams?.code === "string" ? parsed.queryParams.code : null
      const tokenHash = typeof parsed.queryParams?.token_hash === "string" ? parsed.queryParams.token_hash : null
      const type = typeof parsed.queryParams?.type === "string" ? parsed.queryParams.type : null
      const queryValue = (key: string): string | null => {
        const value = parsed.queryParams?.[key]
        return typeof value === "string" ? value : null
      }
      const linkError = authLinkErrorCode({
        error: queryValue("error"),
        errorCode: queryValue("error_code"),
        description: queryValue("error_description"),
      })
      if (linkError) {
        setBanner(loginBanner(linkError) ?? "The confirmation link could not be verified. Request a new one.")
        setScreen("login")
        return
      }
      if (code) {
        const { error } = await supabase!.auth.exchangeCodeForSession(code)
        if (error) {
          setBanner(authErrorMessage(error, "callback"))
          setScreen("login")
          return
        }
      } else if (tokenHash && type && OTP_TYPES.has(type)) {
        const { error } = await supabase!.auth.verifyOtp({
          type: type as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email",
          token_hash: tokenHash,
        })
        if (error) {
          setBanner(authErrorMessage(error, "callback"))
          setScreen("login")
          return
        }
      } else {
        return
      }
      const verified = await supabase!.auth.getUser()
      if (verified.error || !verified.data.user) {
        setBanner(verified.error ? authErrorMessage(verified.error, "session") : "The link did not create a confirmed session.")
        setScreen("login")
        return
      }
      setUser(verified.data.user)
      await loadProfile(verified.data.user)
      setInfo(null)
      setBanner(null)
      setScreen(type === "recovery" ? "reset" : "home")
    }
    void Linking.getInitialURL().then(handle)
    const subscription = Linking.addEventListener("url", (event) => {
      void handle(event.url)
    })
    return () => subscription.remove()
  }, [])

  async function loadProfile(nextUser: User) {
    if (!supabase) return
    const metadata = nextUser.user_metadata?.full_name
    const fallback = typeof metadata === "string" ? metadata : ""
    const { data, error } = await supabase.from("profiles").select("full_name").eq("id", nextUser.id).maybeSingle()
    if (error || !data) {
      setProfileName(fallback)
      setProfileNote(error ? "The profile row could not be read. Apply the database migrations if the name is missing." : null)
      return
    }
    const fullName = typeof data.full_name === "string" ? data.full_name : fallback
    setProfileName(fullName)
    setProfileNote(null)
  }

  if (screen === "config") {
    return (
      <Shell>
        <Text style={styles.title}>Configuration required</Text>
        <Text style={styles.body}>
          Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart Expo. This screen did not
          create a session. Do not add the service-role key to the app.
        </Text>
      </Shell>
    )
  }

  if (screen === "loading") {
    return (
      <Shell>
        <ActivityIndicator color="#e6e8e6" />
        <Text style={styles.body}>Checking the saved session…</Text>
      </Shell>
    )
  }

  if (screen === "offline") {
    return (
      <Shell>
        <Text style={styles.title}>Account service unavailable</Text>
        {banner ? <Text style={styles.error}>{banner}</Text> : null}
        <PrimaryButton
          label="Try again"
          onPress={() => {
            setBanner(null)
            setScreen("loading")
            setAttempt((current) => current + 1)
          }}
        />
      </Shell>
    )
  }

  if (screen === "home" && user) {
    return (
      <Shell>
        <Text style={styles.brand}>GoVio</Text>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.body}>Email: {user.email || "No email on this session."}</Text>
        <Text style={styles.body}>Name: {profileName || "Not set"}</Text>
        {profileNote ? <Text style={styles.note}>{profileNote}</Text> : null}
        <Text style={styles.note}>
          Permanent deletion is done from the signed-in GoVio web Settings screen. This phone does not delete the
          account, and it does not upload the browser ledger.
        </Text>
        <SecondaryButton label="Set a new password" onPress={() => setScreen("reset")} />
        <SecondaryButton
          label="Log out"
          onPress={() => {
            void (async () => {
              if (!supabase) return "Account sign-in is not configured."
              const { error } = await supabase.auth.signOut()
              if (error) {
                setBanner(authErrorMessage(error, "session"))
                return
              }
              setUser(null)
              setBanner(null)
              setScreen("login")
            })()
          }}
        />
        {banner ? <Text style={styles.error}>{banner}</Text> : null}
      </Shell>
    )
  }

  return (
    <Shell>
      <Text style={styles.brand}>GoVio</Text>
      {screen === "login" ? (
        <AuthForm
          title="Sign in"
          submitLabel="Sign in"
          fields={["email", "password"]}
          banner={banner}
          info={info}
          onSubmit={async (values) => {
            if (!supabase) return "Account sign-in is not configured."
            const errors = validateSignIn({ email: values.email, password: values.password })
            if (errors) return errors
            const { data, error } = await supabase.auth.signInWithPassword({
              email: values.email.trim(),
              password: values.password,
            })
            if (error) return authErrorMessage(error, "sign-in")
            if (!data.session || !data.user?.email_confirmed_at) {
              if (data.session) await supabase.auth.signOut()
              return "This email is not verified yet. Open the confirmation link, then sign in."
            }
            const verified = await supabase.auth.getUser()
            if (verified.error || !verified.data.user) {
              return verified.error ? authErrorMessage(verified.error, "session") : "Sign-in could not be confirmed."
            }
            setUser(verified.data.user)
            await loadProfile(verified.data.user)
            setBanner(null)
            setInfo(null)
            setScreen("home")
            return null
          }}
        />
      ) : null}
      {screen === "register" ? (
        <AuthForm
          title="Create an account"
          submitLabel="Create account"
          fields={["name", "email", "password", "confirm"]}
          banner={banner}
          info={info}
          onSubmit={async (values) => {
            if (!supabase) return "Account sign-in is not configured."
            const errors = validateSignUp({
              email: values.email,
              password: values.password,
              confirmPassword: values.confirm,
              fullName: values.name,
            })
            if (errors) return errors
            const { data, error } = await supabase.auth.signUp({
              email: values.email.trim(),
              password: values.password,
              options: {
                emailRedirectTo: redirectTo,
                data: { full_name: values.name.trim() },
              },
            })
            if (error) return authErrorMessage(error, "sign-up")
            if (!data.session || !data.user?.email_confirmed_at) {
              if (data.session) await supabase.auth.signOut()
              setInfo(`Check ${values.email.trim()} for a confirmation link. This app does not mark the account verified. Add this redirect in Supabase if the link should open here: ${redirectTo}`)
              setBanner(null)
              return null
            }
            setUser(data.user)
            await loadProfile(data.user)
            setScreen("home")
            return null
          }}
        />
      ) : null}
      {screen === "forgot" ? (
        <AuthForm
          title="Reset password"
          submitLabel="Send reset link"
          fields={["email"]}
          banner={banner}
          info={info}
          onSubmit={async (values) => {
            if (!supabase) return "Account sign-in is not configured."
            const errors = validateForgotPassword(values.email)
            if (errors) return errors
            const { error } = await supabase.auth.resetPasswordForEmail(values.email.trim(), { redirectTo })
            if (error) return authErrorMessage(error, "reset")
            setInfo("If that email can receive mail, a reset link is on its way. Open it on this phone.")
            setBanner(null)
            return null
          }}
        />
      ) : null}
      {screen === "reset" ? (
        <AuthForm
          title="Choose a new password"
          submitLabel="Update password"
          fields={["password", "confirm"]}
          banner={banner}
          info={info}
          onSubmit={async (values) => {
            if (!supabase) return "Account sign-in is not configured."
            const errors = validatePasswordReset({ password: values.password, confirmPassword: values.confirm })
            if (errors) return errors
            const verified = await supabase.auth.getUser()
            if (verified.error || !verified.data.user) {
              return verified.error
                ? authErrorMessage(verified.error, "session")
                : "This reset link is invalid or has expired. Request a new one."
            }
            const { error } = await supabase.auth.updateUser({ password: values.password })
            if (error) return authErrorMessage(error, "reset")
            setUser(verified.data.user)
            await loadProfile(verified.data.user)
            setInfo("Password updated.")
            setBanner(null)
            setScreen("home")
            return null
          }}
        />
      ) : null}
      <View style={styles.links}>
        {screen !== "login" ? <TextLink label="Sign in" onPress={() => swap(setScreen, setBanner, setInfo, "login")} /> : null}
        {screen !== "register" ? <TextLink label="Create an account" onPress={() => swap(setScreen, setBanner, setInfo, "register")} /> : null}
        {screen !== "forgot" && screen !== "reset" ? (
          <TextLink label="Forgot password" onPress={() => swap(setScreen, setBanner, setInfo, "forgot")} />
        ) : null}
      </View>
    </Shell>
  )
}

function swap(
  setScreen: (screen: Screen) => void,
  setBanner: (value: string | null) => void,
  setInfo: (value: string | null) => void,
  next: Screen,
) {
  setBanner(null)
  setInfo(null)
  setScreen(next)
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function AuthForm({
  title,
  submitLabel,
  fields,
  banner,
  info,
  onSubmit,
}: {
  title: string
  submitLabel: string
  fields: Array<"name" | "email" | "password" | "confirm">
  banner: string | null
  info: string | null
  onSubmit: (values: { name: string; email: string; password: string; confirm: string }) => Promise<FieldErrors | string | null>
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  return (
    <View style={styles.form}>
      <Text style={styles.title}>{title}</Text>
      {banner ? <Text style={styles.error}>{banner}</Text> : null}
      {info ? <Text style={styles.note}>{info}</Text> : null}
      {message ? <Text style={styles.error}>{message}</Text> : null}
      {fields.includes("name") ? (
        <Field label="Full name" value={name} onChangeText={setName} error={fieldError(errors, "fullName")} autoComplete="name" />
      ) : null}
      {fields.includes("email") ? (
        <Field label="Email" value={email} onChangeText={setEmail} error={fieldError(errors, "email")} keyboardType="email-address" autoComplete="email" />
      ) : null}
      {fields.includes("password") ? (
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={fieldError(errors, "password")}
          secureTextEntry={!showPassword}
          autoComplete="password"
          trailing={showPassword ? "Hide" : "Show"}
          onTrailing={() => setShowPassword((current) => !current)}
        />
      ) : null}
      {fields.includes("confirm") ? (
        <Field
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          error={fieldError(errors, "confirmPassword")}
          secureTextEntry={!showPassword}
          autoComplete="password"
        />
      ) : null}
      <PrimaryButton
        label={pending ? "Please wait…" : submitLabel}
        disabled={pending}
        onPress={() => {
          void (async () => {
            setPending(true)
            setMessage(null)
            const result = await onSubmit({ name, email, password, confirm })
            if (result && typeof result === "object") setErrors(result)
            else {
              setErrors({})
              if (typeof result === "string") setMessage(result)
            }
            setPending(false)
          })()
        }}
      />
    </View>
  )
}

function Field({
  label,
  value,
  onChangeText,
  error,
  secureTextEntry,
  keyboardType,
  autoComplete,
  trailing,
  onTrailing,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  error: string | null
  secureTextEntry?: boolean
  keyboardType?: "email-address"
  autoComplete?: "email" | "name" | "password"
  trailing?: string
  onTrailing?: () => void
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={styles.label}>{label}</Text>
        {trailing && onTrailing ? (
          <Pressable accessibilityRole="button" accessibilityState={{ selected: trailing === "Hide" }} onPress={onTrailing}>
            <Text style={styles.link}>{trailing} password</Text>
          </Pressable>
        ) : null}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        accessibilityLabel={label}
        placeholderTextColor="#8d948f"
        style={styles.input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primary, disabled && styles.disabled]}>
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  )
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondary}>
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  )
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#101211" },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 64, paddingBottom: 32, gap: 12 },
  brand: { color: "#e6e8e6", fontSize: 16, fontWeight: "600" },
  title: { color: "#e6e8e6", fontSize: 22, fontWeight: "600" },
  body: { color: "#8d948f", fontSize: 15, lineHeight: 22 },
  note: { color: "#8d948f", fontSize: 14, lineHeight: 20 },
  error: { color: "#e06a62", fontSize: 14, lineHeight: 20 },
  form: { gap: 12 },
  field: { gap: 6 },
  fieldHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  label: { color: "#e6e8e6", fontSize: 14 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "#171a18",
    color: "#e6e8e6",
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  primary: { minHeight: 44, borderRadius: 6, backgroundColor: "#e4e7e5", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  primaryText: { color: "#141716", fontSize: 15, fontWeight: "600" },
  secondary: { minHeight: 44, borderRadius: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  secondaryText: { color: "#e6e8e6", fontSize: 15 },
  disabled: { opacity: 0.6 },
  link: { color: "#e6e8e6", fontSize: 14, textDecorationLine: "underline" },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
})
