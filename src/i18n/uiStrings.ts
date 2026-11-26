import { useEffect, useState } from "react";

export type UiLanguage = "en" | "ta";

export interface UiStrings {
  lang: UiLanguage;
  menuTitle: string;
  sections: {
    general: string;
    brain: string;
    avatar_voice: string;
    cybershield: string;
    tools: string;
    settings_support: string;
  };
  labels: {
    basicDetails: string;
    displayName: string;
    greetingTemplate: string;
    smartReminders: string;
    readBriefing: string;
    addReminder: string;
    breakTimer: string;
    onlineBrain: string;
    offlineEngine: string;
    smartAutoRouting: string;
    avatar2DEngine: string;
    avatar3DCore: string;
    voiceStudio: string;
    cybershieldTitle: string;
    openSecurityCenter: string;
    installedTools: string;
    githubToTool: string;
    projectAdvisor: string;
    uiTheme: string;
    uiLanguage: string;
    backupAndCloud: string;
    projectReport: string;
    githubBackup: string;
    customerSupport: string;
    exportDiagnostics: string;
    save: string;
    close: string;
    online: string;
    aiDisclaimer: string;
  };
}

const EN_STRINGS: UiStrings = {
  lang: "en",
  menuTitle: "Angel AI Control Center",
  sections: {
    general: "General",
    brain: "AI Brain",
    avatar_voice: "Avatar & Voice",
    cybershield: "CyberShield",
    tools: "Tools",
    settings_support: "Settings & Support",
  },
  labels: {
    basicDetails: "Basic Details & Custom Boss Greeting",
    displayName: "Display Name",
    greetingTemplate: "Startup Welcome Greeting",
    smartReminders: "Daily Briefing & Personal Smart Reminders",
    readBriefing: "Read Today's Briefing",
    addReminder: "Add Reminder",
    breakTimer: "Wellness Break Timer",
    onlineBrain: "Online Brain (Cloud Heavy Engine)",
    offlineEngine: "Offline & Local Engine (Zero-Internet)",
    smartAutoRouting: "Smart Auto-Routing & Failover",
    avatar2DEngine: "2D Animated Companion Engine (8 States)",
    avatar3DCore: "3D Companion & Sci-Fi Core Themes",
    voiceStudio: "Tamil / Tanglish / English Voice Studio",
    cybershieldTitle: "Angel CyberShield & OS Doctor",
    openSecurityCenter: "Open Full CyberShield Command Center",
    installedTools: "Installed MCP & Zero-Python Tools",
    githubToTool: "GitHub Repo -> Instant Safe Tool Converter",
    projectAdvisor: "Smart Project Tool Advisor",
    uiTheme: "Acrylic & Glassmorphism Theme",
    uiLanguage: "Interface Language",
    backupAndCloud: "Cloud Storage & GitHub Backup",
    projectReport: "A-to-Z Project Analysis Report",
    githubBackup: "Backup to GitHub Now",
    customerSupport: "Customer Support & Diagnostics",
    exportDiagnostics: "Export Diagnostic Bundle",
    save: "Save Preferences",
    close: "Close",
    online: "ONLINE",
    aiDisclaimer: "Angel is AI and can make mistakes.",
  },
};

const TA_STRINGS: UiStrings = {
  lang: "ta",
  menuTitle: "ஏஞ்சல் AI கட்டுப்பாட்டு மையம்",
  sections: {
    general: "பொதுவானவை",
    brain: "AI மூளை",
    avatar_voice: "அவதாரம் & குரல்",
    cybershield: "சைபர்ஷீல்ட்",
    tools: "கருவிகள்",
    settings_support: "அமைப்புகள் & உதவி",
  },
  labels: {
    basicDetails: "அடிப்படை விவரங்கள் & வரவேற்பு வாழ்த்து",
    displayName: "பயனர் பெயர்",
    greetingTemplate: "தொடக்க வரவேற்பு வாசகம்",
    smartReminders: "தினசரி சுருக்கம் & தனிப்பட்ட நினைவூட்டல்கள்",
    readBriefing: "இன்றைய சுருக்கத்தை வாசி",
    addReminder: "நினைவூட்டல் சேர்",
    breakTimer: "ஆரோக்கிய இடைவேளை நேரம்",
    onlineBrain: "ஆன்லைன் மூளை (கிளவுட் இன்ஜின்)",
    offlineEngine: "ஆஃப்லைன் & லோக்கல் இன்ஜின்",
    smartAutoRouting: "ஸ்மார்ட் ஆட்டோ-ரூட்டிங்",
    avatar2DEngine: "2D அனிமேஷன் துணை (8 நிலைகள்)",
    avatar3DCore: "3D துணை & கோர் தீம்கள்",
    voiceStudio: "தமிழ் / தங்கிலீஷ் / ஆங்கில குரல்",
    cybershieldTitle: "ஏஞ்சல் சைபர்ஷீல்ட் & OS டாக்டர்",
    openSecurityCenter: "முழு சைபர்ஷீல்ட் மையத்தைத் திற",
    installedTools: "நிறுவப்பட்ட MCP & கருவிகள்",
    githubToTool: "GitHub -> பாதுகாப்பான கருவி மாற்றி",
    projectAdvisor: "ஸ்மார்ட் ப்ராஜெக்ட் கருவி ஆலோசகர்",
    uiTheme: "அக்ரிலிக் & கிளாஸ் தீம்",
    uiLanguage: "இடைமுக மொழி",
    backupAndCloud: "கிளவுட் & GitHub காப்புப்பிரதி",
    projectReport: "A-to-Z திட்ட பகுப்பாய்வு அறிக்கை",
    githubBackup: "இப்போது GitHub-ல் சேமி",
    customerSupport: "வாடிக்கையாளர் உதவி & கண்டறிதல்",
    exportDiagnostics: "கண்டறிதல் தொகுப்பைப் பதிவிறக்கு",
    save: "அமைப்புகளைச் சேமி",
    close: "மூடு",
    online: "இணைப்பில்",
    aiDisclaimer: "ஏஞ்சல் ஒரு AI, தவறுகள் செய்யக்கூடும்.",
  },
};

const UI_LANG_KEY = "angel_ui_language";

export function getUiLanguage(): UiLanguage {
  try {
    const val = localStorage.getItem(UI_LANG_KEY);
    return val === "ta" ? "ta" : "en";
  } catch {
    return "en";
  }
}

export function setUiLanguage(lang: UiLanguage) {
  localStorage.setItem(UI_LANG_KEY, lang);
  window.dispatchEvent(new CustomEvent("angel-ui-language-changed", { detail: { lang } }));
}

export function getUiStrings(lang?: UiLanguage): UiStrings {
  const active = lang || getUiLanguage();
  return active === "ta" ? TA_STRINGS : EN_STRINGS;
}

export function useUiStrings(): [UiStrings, UiLanguage, (lang: UiLanguage) => void] {
  const [lang, setLangState] = useState<UiLanguage>(() => getUiLanguage());

  useEffect(() => {
    const onLangChange = (e: any) => {
      if (e?.detail?.lang === "ta" || e?.detail?.lang === "en") {
        setLangState(e.detail.lang);
      } else {
        setLangState(getUiLanguage());
      }
    };
    window.addEventListener("angel-ui-language-changed", onLangChange);
    window.addEventListener("storage", onLangChange);
    return () => {
      window.removeEventListener("angel-ui-language-changed", onLangChange);
      window.removeEventListener("storage", onLangChange);
    };
  }, []);

  const updateLang = (next: UiLanguage) => {
    setUiLanguage(next);
    setLangState(next);
  };

  return [getUiStrings(lang), lang, updateLang];
}
