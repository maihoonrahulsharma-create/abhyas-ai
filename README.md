# ABHYAS AI

Pastel clay-style AI study, quiz, test and result experience.

## Main flow

1. Login / Sign up
2. Dashboard after login
3. User Manual from the left sidebar
4. Start New Test / Quiz
5. Add PDF, photo, public link or direct topic
6. Choose question count: Automatic, preset, or Custom
7. Choose Test / Quiz, difficulty, language and timer
8. Test screen: question + Question Navigator only
9. Pause at the top, Next at the bottom, Submit Test in the navigator bottom-right
10. Result + question-by-question analysis after submission

## AI providers

Gemini → OpenRouter → Groq → Ollama

Provider keys are entered by the user in Settings and stored encrypted server-side.

## Local setup

Use the existing `.env.local` from your working project. Do not commit secrets.

## Google Login Setup

The round **G** button on `/auth` is wired to Supabase Google OAuth. The Apple and Facebook buttons remain disabled until those providers are configured.

1. In Supabase Dashboard, open **Authentication → Providers → Google** and enable Google.
2. Create a Google OAuth Web Client in Google Cloud / Google Auth Platform.
3. In Google, add your Supabase project's OAuth callback URL as an **Authorized redirect URI**. Supabase shows the exact callback URL on the Google provider page.
4. Paste the Google Client ID and Client Secret into the Supabase Google provider settings and save.
5. Keep the ABHYAS redirect URL as `/auth/callback`; the app exchanges the OAuth code on the server and then sends the user to `/`.

For the deployed ABHYAS site, the browser redirect is:
`https://abhyas-ai-flax.vercel.app/auth/callback`

Important: Google OAuth can provide the user's Google account email/name, but it does not reliably provide a 10-digit mobile number. The current direct Google flow therefore signs the user in without fabricating a mobile number; the existing email/password registration still requires the 10-digit mobile field.


### AI provider fallback
Bheja Fry tries configured providers in this order: Gemini → OpenRouter → Groq → Hugging Face → Ollama. A provider is only used when the previous compatible provider fails validation or request execution. The API now returns a provider trace so local testing can show which provider actually succeeded. For PDF/image uploads, Groq, Hugging Face and Ollama are explicitly marked as skipped because this generation path does not pass those binary sources to text-only models.
