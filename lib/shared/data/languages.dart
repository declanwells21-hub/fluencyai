class AppLanguage {
  final String code;
  final String name;
  final String flag;
  const AppLanguage({required this.code, required this.name, required this.flag});
}

/// CEFR level labels/descriptions, shared between the level-picker step and
/// the final study-plan summary so both always agree on the wording.
/// Each tuple is (code, title, description).
const List<(String, String, String)> kLevels = [
  ('A1', 'Beginner', 'Basic phrases and everyday expressions'),
  ('A2', 'Elementary', 'Simple conversations on familiar topics'),
  ('B1', 'Intermediate', 'Handle most situations while travelling'),
  ('B2', 'Upper Intermediate', 'Fluent enough for most conversations'),
  ('C1', 'Advanced', 'Flexible, effective use for complex topics'),
  ('C2', 'Mastery', 'Near-native precision and nuance'),
];

/// Target languages a learner can choose to master.
const List<AppLanguage> kLanguages = [
  AppLanguage(code: 'en', name: 'English', flag: '🇺🇸'),
  AppLanguage(code: 'de', name: 'Deutsch', flag: '🇩🇪'),
  AppLanguage(code: 'es', name: 'Español', flag: '🇪🇸'),
  AppLanguage(code: 'fr', name: 'Français', flag: '🇫🇷'),
  AppLanguage(code: 'it', name: 'Italiano', flag: '🇮🇹'),
  AppLanguage(code: 'pt', name: 'Português', flag: '🇵🇹'),
  AppLanguage(code: 'ja', name: '日本語', flag: '🇯🇵'),
  AppLanguage(code: 'zh', name: '中文', flag: '🇨🇳'),
  AppLanguage(code: 'ko', name: '한국어', flag: '🇰🇷'),
  AppLanguage(code: 'ar', name: 'العربية', flag: '🇸🇦'),
  AppLanguage(code: 'ru', name: 'Русский', flag: '🇷🇺'),
  AppLanguage(code: 'hi', name: 'हिन्दी', flag: '🇮🇳'),
  AppLanguage(code: 'nl', name: 'Nederlands', flag: '🇳🇱'),
  AppLanguage(code: 'sv', name: 'Svenska', flag: '🇸🇪'),
  AppLanguage(code: 'pl', name: 'Polski', flag: '🇵🇱'),
  AppLanguage(code: 'tr', name: 'Türkçe', flag: '🇹🇷'),
  AppLanguage(code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳'),
  AppLanguage(code: 'th', name: 'ไทย', flag: '🇹🇭'),
  AppLanguage(code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩'),
  AppLanguage(code: 'el', name: 'Ελληνικά', flag: '🇬🇷'),
  AppLanguage(code: 'he', name: 'עברית', flag: '🇮🇱'),
  AppLanguage(code: 'cs', name: 'Čeština', flag: '🇨🇿'),
  AppLanguage(code: 'ro', name: 'Română', flag: '🇷🇴'),
  AppLanguage(code: 'uk', name: 'Українська', flag: '🇺🇦'),
  AppLanguage(code: 'sw', name: 'Kiswahili', flag: '🇰🇪'),
];

class TutorVoice {
  final String name;
  final String gender; // 'Female' | 'Male'
  final String accentTag; // which regional accent this voice speaks with
  const TutorVoice({required this.name, required this.gender, required this.accentTag});
}

/// 3-4 tutor voices per language, each tied to a specific regional accent
/// (matches an entry in kAccents below) rather than a generic default.
const Map<String, List<TutorVoice>> kTutors = {
  'en': [
    TutorVoice(name: 'Sarah Bennett', gender: 'Female', accentTag: 'American (Standard)'),
    TutorVoice(name: 'James Carter', gender: 'Male', accentTag: 'American (Standard)'),
    TutorVoice(name: 'Poppy Hartley', gender: 'Female', accentTag: 'British (RP)'),
    TutorVoice(name: 'Liam O\'Sullivan', gender: 'Male', accentTag: 'Irish'),
  ],
  'de': [
    TutorVoice(name: 'Anke Müller', gender: 'Female', accentTag: 'Standard (Berlin)'),
    TutorVoice(name: 'Jonas Bäcker', gender: 'Male', accentTag: 'Standard (Berlin)'),
    TutorVoice(name: 'Resi Gruber', gender: 'Female', accentTag: 'Bavarian (München)'),
    TutorVoice(name: 'Lukas Frei', gender: 'Male', accentTag: 'Swiss (Zürich)'),
  ],
  'es': [
    TutorVoice(name: 'Lucía Núñez', gender: 'Female', accentTag: 'Castilian (Madrid)'),
    TutorVoice(name: 'Mateo Peña', gender: 'Male', accentTag: 'Mexican'),
    TutorVoice(name: 'Valentina Rojas', gender: 'Female', accentTag: 'Argentinian'),
    TutorVoice(name: 'Andrés Ríos', gender: 'Male', accentTag: 'Colombian'),
  ],
  'fr': [
    TutorVoice(name: 'Élodie Béchard', gender: 'Female', accentTag: 'Parisian'),
    TutorVoice(name: 'Théo Girard', gender: 'Male', accentTag: 'Parisian'),
    TutorVoice(name: 'Camille Tremblay', gender: 'Female', accentTag: 'Québécois'),
    TutorVoice(name: 'Antoine Dubois', gender: 'Male', accentTag: 'Belgian'),
  ],
  'it': [
    TutorVoice(name: 'Giulia Romano', gender: 'Female', accentTag: 'Standard (Roman)'),
    TutorVoice(name: 'Marco Ferrari', gender: 'Male', accentTag: 'Milanese'),
    TutorVoice(name: 'Chiara Esposito', gender: 'Female', accentTag: 'Neapolitan'),
  ],
  'pt': [
    TutorVoice(name: 'Beatriz Silva', gender: 'Female', accentTag: 'European (Lisbon)'),
    TutorVoice(name: 'Rafael Costa', gender: 'Male', accentTag: 'Brazilian (São Paulo)'),
    TutorVoice(name: 'Larissa Almeida', gender: 'Female', accentTag: 'Brazilian (Rio)'),
  ],
  'ja': [
    TutorVoice(name: 'Aoi Yamamoto', gender: 'Female', accentTag: 'Standard (Tokyo)'),
    TutorVoice(name: 'Ren Kobayashi', gender: 'Male', accentTag: 'Standard (Tokyo)'),
    TutorVoice(name: 'Haruka Yoshida', gender: 'Female', accentTag: 'Kansai'),
  ],
  'zh': [
    TutorVoice(name: 'Li Wei', gender: 'Female', accentTag: 'Standard (Beijing)'),
    TutorVoice(name: 'Zhang Hao', gender: 'Male', accentTag: 'Standard (Beijing)'),
    TutorVoice(name: 'Chen Yu', gender: 'Female', accentTag: 'Taiwanese Mandarin'),
  ],
  'ko': [
    TutorVoice(name: 'Ji-woo Park', gender: 'Female', accentTag: 'Standard (Seoul)'),
    TutorVoice(name: 'Min-jun Kim', gender: 'Male', accentTag: 'Standard (Seoul)'),
    TutorVoice(name: 'Seo-yeon Choi', gender: 'Female', accentTag: 'Busan'),
  ],
  'ar': [
    TutorVoice(name: 'Layla Haddad', gender: 'Female', accentTag: 'Modern Standard'),
    TutorVoice(name: 'Omar Khalil', gender: 'Male', accentTag: 'Egyptian'),
    TutorVoice(name: 'Nour Saab', gender: 'Female', accentTag: 'Levantine'),
  ],
  'ru': [
    TutorVoice(name: 'Anastasia Volkova', gender: 'Female', accentTag: 'Standard (Moscow)'),
    TutorVoice(name: 'Dmitri Sokolov', gender: 'Male', accentTag: 'Standard (Moscow)'),
    TutorVoice(name: 'Yekaterina Orlova', gender: 'Female', accentTag: 'St. Petersburg'),
  ],
  'hi': [
    TutorVoice(name: 'Ananya Sharma', gender: 'Female', accentTag: 'Standard (Delhi)'),
    TutorVoice(name: 'Arjun Mehta', gender: 'Male', accentTag: 'Standard (Delhi)'),
    TutorVoice(name: 'Priya Nair', gender: 'Female', accentTag: 'Mumbai'),
  ],
  'nl': [
    TutorVoice(name: 'Fleur de Vries', gender: 'Female', accentTag: 'Standard (Randstad)'),
    TutorVoice(name: 'Daan Bakker', gender: 'Male', accentTag: 'Standard (Randstad)'),
    TutorVoice(name: 'Marieke Peeters', gender: 'Female', accentTag: 'Flemish (Belgium)'),
  ],
  'sv': [
    TutorVoice(name: 'Elin Söderberg', gender: 'Female', accentTag: 'Standard (Stockholm)'),
    TutorVoice(name: 'Erik Lindqvist', gender: 'Male', accentTag: 'Standard (Stockholm)'),
    TutorVoice(name: 'Sara Nilsson', gender: 'Female', accentTag: 'Gothenburg'),
  ],
  'pl': [
    TutorVoice(name: 'Zofia Kowalska', gender: 'Female', accentTag: 'Standard (Warsaw)'),
    TutorVoice(name: 'Piotr Nowak', gender: 'Male', accentTag: 'Standard (Warsaw)'),
    TutorVoice(name: 'Kasia Wiśniewska', gender: 'Female', accentTag: 'Krakow'),
  ],
  'tr': [
    TutorVoice(name: 'Elif Yıldız', gender: 'Female', accentTag: 'Standard (Istanbul)'),
    TutorVoice(name: 'Emre Şahin', gender: 'Male', accentTag: 'Standard (Istanbul)'),
    TutorVoice(name: 'Deniz Aydın', gender: 'Female', accentTag: 'Aegean'),
  ],
  'vi': [
    TutorVoice(name: 'Linh Nguyễn', gender: 'Female', accentTag: 'Northern (Hanoi)'),
    TutorVoice(name: 'Minh Trần', gender: 'Male', accentTag: 'Southern (Saigon)'),
  ],
  'th': [
    TutorVoice(name: 'Suda Charoen', gender: 'Female', accentTag: 'Standard (Bangkok)'),
    TutorVoice(name: 'Chai Ruangrit', gender: 'Male', accentTag: 'Standard (Bangkok)'),
  ],
  'id': [
    TutorVoice(name: 'Putri Wulandari', gender: 'Female', accentTag: 'Standard (Jakarta)'),
    TutorVoice(name: 'Bagus Santoso', gender: 'Male', accentTag: 'Standard (Jakarta)'),
  ],
  'el': [
    TutorVoice(name: 'Elena Papadopoulou', gender: 'Female', accentTag: 'Standard (Athens)'),
    TutorVoice(name: 'Nikos Georgiou', gender: 'Male', accentTag: 'Standard (Athens)'),
  ],
  'he': [
    TutorVoice(name: 'Noa Ben-David', gender: 'Female', accentTag: 'Standard (Tel Aviv)'),
    TutorVoice(name: 'Itai Cohen', gender: 'Male', accentTag: 'Standard (Tel Aviv)'),
  ],
  'cs': [
    TutorVoice(name: 'Tereza Svobodová', gender: 'Female', accentTag: 'Standard (Prague)'),
    TutorVoice(name: 'Jakub Dvořák', gender: 'Male', accentTag: 'Standard (Prague)'),
  ],
  'ro': [
    TutorVoice(name: 'Ioana Constantin', gender: 'Female', accentTag: 'Standard (Bucharest)'),
    TutorVoice(name: 'Andrei Popescu', gender: 'Male', accentTag: 'Standard (Bucharest)'),
  ],
  'uk': [
    TutorVoice(name: 'Kateryna Melnyk', gender: 'Female', accentTag: 'Standard (Kyiv)'),
    TutorVoice(name: 'Andriy Kovalenko', gender: 'Male', accentTag: 'Standard (Kyiv)'),
  ],
  'sw': [
    TutorVoice(name: 'Amani Juma', gender: 'Female', accentTag: 'Standard (Nairobi)'),
    TutorVoice(name: 'Baraka Otieno', gender: 'Male', accentTag: 'Coastal (Mombasa)'),
  ],
};

/// Regional accent options per language - shown as a dropdown and also
/// used to auto-select a matching tutor voice.
const Map<String, List<String>> kAccents = {
  'en': ['American (Standard)', 'British (RP)', 'Australian', 'Irish', 'Scottish'],
  'de': ['Standard (Berlin)', 'Bavarian (München)', 'Austrian (Wien)', 'Swiss (Zürich)', 'Northern (Hamburg)'],
  'es': ['Castilian (Madrid)', 'Mexican', 'Argentinian', 'Colombian', 'Caribbean'],
  'fr': ['Parisian', 'Québécois', 'Belgian', 'Swiss French', 'Southern French'],
  'it': ['Standard (Roman)', 'Milanese', 'Neapolitan', 'Sicilian', 'Tuscan'],
  'pt': ['European (Lisbon)', 'Brazilian (São Paulo)', 'Brazilian (Rio)', 'Northern Portuguese', 'Azorean'],
  'ja': ['Standard (Tokyo)', 'Kansai', 'Formal Business', 'Casual Youth', 'Hokkaido'],
  'zh': ['Standard (Beijing)', 'Taiwanese Mandarin', 'Shanghainese-influenced', 'Cantonese-influenced', 'Sichuanese-influenced'],
  'ko': ['Standard (Seoul)', 'Busan', 'Jeju', 'Formal Business', 'Casual Youth'],
  'ar': ['Modern Standard', 'Egyptian', 'Levantine', 'Gulf', 'Maghrebi'],
  'ru': ['Standard (Moscow)', 'St. Petersburg', 'Southern Russian', 'Siberian', 'Formal Business'],
  'hi': ['Standard (Delhi)', 'Mumbai', 'Formal Business', 'Casual Youth', 'Southern-influenced'],
  'nl': ['Standard (Randstad)', 'Flemish (Belgium)', 'Northern Dutch', 'Formal Business', 'Casual'],
  'sv': ['Standard (Stockholm)', 'Gothenburg', 'Skåne (Southern)', 'Finland Swedish'],
  'pl': ['Standard (Warsaw)', 'Krakow', 'Silesian-influenced', 'Formal Business'],
  'tr': ['Standard (Istanbul)', 'Aegean', 'Black Sea', 'Formal Business'],
  'vi': ['Northern (Hanoi)', 'Southern (Saigon)', 'Central (Huế)'],
  'th': ['Standard (Bangkok)', 'Northern (Chiang Mai)', 'Southern'],
  'id': ['Standard (Jakarta)', 'Javanese-influenced', 'Formal Business'],
  'el': ['Standard (Athens)', 'Thessaloniki', 'Cretan'],
  'he': ['Standard (Tel Aviv)', 'Jerusalem', 'Formal Business'],
  'cs': ['Standard (Prague)', 'Moravian', 'Formal Business'],
  'ro': ['Standard (Bucharest)', 'Transylvanian', 'Moldovan-influenced'],
  'uk': ['Standard (Kyiv)', 'Western (Lviv)', 'Formal Business'],
  'sw': ['Standard (Nairobi)', 'Coastal (Mombasa)', 'Tanzanian'],
};
