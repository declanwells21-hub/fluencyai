/// Supabase project credentials. The anon key is safe to embed in a client
/// app - unlike the Claude/Deepgram/ElevenLabs keys, this is NOT a secret
/// that needs proxying. Supabase's actual security boundary is Row Level
/// Security (RLS) policies on the database tables, not hiding this key.
///
/// Fill these in via --dart-define when running/building (see README):
///   flutter run --dart-define=SUPABASE_URL=https://xxxx.supabase.co \
///               --dart-define=SUPABASE_ANON_KEY=eyJ...
class SupabaseConfig {
  static const String url = String.fromEnvironment('SUPABASE_URL', defaultValue: '');
  static const String anonKey = String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: '');

  static bool get isConfigured => url.isNotEmpty && anonKey.isNotEmpty;
}
