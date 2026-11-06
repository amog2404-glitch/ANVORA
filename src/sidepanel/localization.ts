import type { LanguageCode, LanguageOption } from './types';

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', nativeName: 'English', flagSymbol: 'EN' },
  { code: 'hi', label: 'Hindi', nativeName: 'हिन्दी', flagSymbol: 'हि' },
  { code: 'te', label: 'Telugu', nativeName: 'తెలుగు', flagSymbol: 'తె' },
];

export interface LocalizedStrings {
  greeting: string;
  subGreeting: string;
  suggestions: string[];
  voiceStatusIdle: string;
  voiceStatusListening: string;
  voiceStatusProcessing: string;
  voiceStatusTranscribing: string;
  voiceRecordingStop: string;
  voiceRecordingCancel: string;
  voiceStatusSpeaking: string;
  voiceStatusError: string;
  inputPlaceholder: string;
  activityTitle: string;
  activeTabLabel: string;
  historyTitle: string;
  settingsTitle: string;
  confirmActionTitle: string;
  confirmButton: string;
  cancelButton: string;
  copySuccess: string;
  workflowsTitle: string;
  createWorkflowTitle: string;
  activeWorkflowsLabel: string;
  noWorkflowsLabel: string;
}

export const LOCALIZED_CONTENT: Record<LanguageCode, LocalizedStrings> = {
  en: {
    greeting: 'How may I assist your browsing?',
    subGreeting: 'Connected to active browser tab. Ready for voice or text directives.',
    suggestions: [
      'Summarise this page.',
      'Find important information.',
      'Explain this in simpler words.',
      'Extract data table to CSV.',
      'Fill out the form on this page.',
    ],
    voiceStatusIdle: 'Tap to speak',
    voiceStatusListening: 'Listening...',
    voiceStatusProcessing: 'Understanding your request...',
    voiceStatusTranscribing: 'Transcribing complete audio...',
    voiceRecordingStop: 'Tap to finish & send',
    voiceRecordingCancel: 'Cancel recording',
    voiceStatusSpeaking: 'ANVORA is speaking',
    voiceStatusError: 'Voice recognition interrupted. Tap to retry.',
    inputPlaceholder: 'Ask ANVORA anything...',
    activityTitle: 'Autonomous Browser Activity',
    activeTabLabel: 'Active Tab Connected',
    historyTitle: 'Conversation History',
    settingsTitle: 'Assistant Preferences',
    confirmActionTitle: 'Autonomous Action Confirmation',
    confirmButton: 'Confirm Action',
    cancelButton: 'Cancel',
    copySuccess: 'Copied to clipboard',
    workflowsTitle: 'Workflow Automation',
    createWorkflowTitle: 'Create Workflow',
    activeWorkflowsLabel: 'Active Workflows',
    noWorkflowsLabel: 'No active workflows scheduled.',
  },
  te: {
    greeting: 'నేను మీ బ్రౌజింగ్‌కు ఎలా సహాయపడగలను?',
    subGreeting: 'సక్రియ బ్రౌజర్ ట్యాబ్‌తో అనుసంధానించబడింది. వాయిస్ లేదా టెక్స్ట్ ఆదేశాలకు సిద్ధంగా ఉంది.',
    suggestions: [
      'ఈ వెబ్‌పేజీని క్లుప్తీకరించండి.',
      'ముఖ్యమైన సమాచారాన్ని కనుగొనండి.',
      'దీన్ని సులభమైన మాటలలో వివరించండి.',
      'డేటా పట్టికను CSV గా ఎక్స్‌ట్రాక్ట్ చేయండి.',
      'ఈ పేజీలోని ఫారమ్‌ను పూరించండి.',
    ],
    voiceStatusIdle: 'మాట్లాడటానికి తాకండి',
    voiceStatusListening: 'వింటున్నది...',
    voiceStatusProcessing: 'మీ అభ్యర్థనను అర్థం చేసుకుంటోంది...',
    voiceStatusTranscribing: 'పూర్తి ఆడియోను లిప్యంతరీకరిస్తోంది...',
    voiceRecordingStop: 'ముగించి పంపడానికి తాకండి',
    voiceRecordingCancel: 'రద్దు చేయండి',
    voiceStatusSpeaking: 'అన్వోరా మాట్లాడుతోంది',
    voiceStatusError: 'వాయిస్ గుర్తింపు విఫలమైంది. మళ్లీ ప్రయత్నించండి.',
    inputPlaceholder: 'అన్వోరాను ఏదైనా అడగండి...',
    activityTitle: 'స్వయంప్రతిపత్తి బ్రౌజర్ చర్యలు',
    activeTabLabel: 'కనెక్ట్ చేయబడిన ట్యాబ్',
    historyTitle: 'సంభాషణల చరిత్ర',
    settingsTitle: 'సహాయక ప్రాధాన్యతలు',
    confirmActionTitle: 'చర్య నిర్ధారణ',
    confirmButton: 'చర్యను ధృవీకరించండి',
    cancelButton: 'రద్దు చేయండి',
    copySuccess: 'క్లిప్‌బోర్డ్‌కి కాపీ చేయబడింది',
    workflowsTitle: 'వర్క్‌ఫ్లో ఆటోమేషన్',
    createWorkflowTitle: 'వర్క్‌ఫ్లో సృష్టించండి',
    activeWorkflowsLabel: 'సక్రియ వర్క్‌ఫ్లోలు',
    noWorkflowsLabel: 'షెడ్యూల్ చేయబడిన వర్క్‌ఫ్లోలు లేవు.',
  },
  hi: {
    greeting: 'मैं आपके ब्राउज़िंग में कैसे सहायता कर सकता हूँ?',
    subGreeting: 'सक्रिय ब्राउज़र टैब से जुड़ा हुआ है। ध्वनि या पाठ निर्देशों के लिए तैयार।',
    suggestions: [
      'इस पृष्ठ का सारांश दें।',
      'महत्वपूर्ण जानकारी खोजें।',
      'इसे सरल शब्दों में समझाएं।',
      'डेटा तालिका को CSV में निकालें।',
      'इस पृष्ठ पर फ़ॉर्म भरें।',
    ],
    voiceStatusIdle: 'बोलने के लिए स्पर्श करें',
    voiceStatusListening: 'सुन रहा है...',
    voiceStatusProcessing: 'आपके अनुरोध को समझ रहा है...',
    voiceStatusTranscribing: 'पूर्ण ऑडियो को ट्रांसक्राइब कर रहा है...',
    voiceRecordingStop: 'समाप्त कर भेजने के लिए स्पर्श करें',
    voiceRecordingCancel: 'रद्द करें',
    voiceStatusSpeaking: 'अन्वोरा बोल रहा है',
    voiceStatusError: 'आवाज़ पहचान में त्रुटि। पुनः प्रयास करें।',
    inputPlaceholder: 'अन्वोरा से कुछ भी पूछें...',
    activityTitle: 'स्वायत्त ब्राउज़र गतिविधि',
    activeTabLabel: 'सक्रिय टैब कनेक्टेड',
    historyTitle: 'बातचीत का इतिहास',
    settingsTitle: 'सहायक प्राथमिकताएं',
    confirmActionTitle: 'स्वायत्त कार्रवाई पुष्टि',
    confirmButton: 'कार्रवाई की पुष्टि करें',
    cancelButton: 'रद्द करें',
    copySuccess: 'क्लिपबोर्ड पर कॉपी किया गया',
    workflowsTitle: 'वर्कफ़्लो ऑटोमेशन',
    createWorkflowTitle: 'नया वर्कफ़्लो बनाएं',
    activeWorkflowsLabel: 'सक्रिय वर्कफ़्लो',
    noWorkflowsLabel: 'कोई सक्रिय वर्कफ़्लो निर्धारित नहीं है।',
  },
};
