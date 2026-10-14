export interface ChatState {
  // UI state
  hasSubmitted: boolean;
  hasManuallyScrolled: boolean;
  showAnnouncementDialog: boolean;
  hasShownAnnouncementDialog: boolean;
  commandDialogOpen: boolean;
  anyDialogOpen: boolean;

  // Chat data
  suggestedQuestions: string[];
  attachments: Attachment[];
  selectedVisibilityType: 'public' | 'private';
}

interface Attachment {
  name: string;
  contentType?: string;
  mediaType?: string;
  url: string;
  size: number;
}

export type ChatAction =
  | { type: 'SET_HAS_SUBMITTED'; payload: React.SetStateAction<boolean> }
  | { type: 'SET_HAS_MANUALLY_SCROLLED'; payload: boolean }
  | { type: 'SET_SHOW_ANNOUNCEMENT_DIALOG'; payload: boolean }
  | { type: 'SET_HAS_SHOWN_ANNOUNCEMENT_DIALOG'; payload: boolean }
  | { type: 'SET_COMMAND_DIALOG_OPEN'; payload: boolean }
  | { type: 'SET_ANY_DIALOG_OPEN'; payload: boolean }
  | { type: 'SET_SUGGESTED_QUESTIONS'; payload: string[] }
  | { type: 'SET_ATTACHMENTS'; payload: React.SetStateAction<Attachment[]> }
  | { type: 'SET_VISIBILITY_TYPE'; payload: 'public' | 'private' }
  | { type: 'RESET_SUGGESTED_QUESTIONS' }
  | { type: 'RESET_UI_STATE' };

export const chatReducer = (state: ChatState, action: ChatAction): ChatState => {
  switch (action.type) {
    // Updaters run here, on the current state: an upload that finishes while
    // another one is in flight adds to it instead of overwriting it.
    case 'SET_HAS_SUBMITTED':
      return {
        ...state,
        hasSubmitted: typeof action.payload === 'function' ? action.payload(state.hasSubmitted) : action.payload,
      };

    case 'SET_HAS_MANUALLY_SCROLLED':
      return { ...state, hasManuallyScrolled: action.payload };

    case 'SET_SHOW_ANNOUNCEMENT_DIALOG':
      return { ...state, showAnnouncementDialog: action.payload };

    case 'SET_HAS_SHOWN_ANNOUNCEMENT_DIALOG':
      return { ...state, hasShownAnnouncementDialog: action.payload };

    case 'SET_COMMAND_DIALOG_OPEN':
      return { ...state, commandDialogOpen: action.payload };

    case 'SET_ANY_DIALOG_OPEN':
      return { ...state, anyDialogOpen: action.payload };

    case 'SET_SUGGESTED_QUESTIONS':
      return { ...state, suggestedQuestions: action.payload };

    case 'SET_ATTACHMENTS':
      return {
        ...state,
        attachments: typeof action.payload === 'function' ? action.payload(state.attachments) : action.payload,
      };

    case 'SET_VISIBILITY_TYPE':
      return { ...state, selectedVisibilityType: action.payload };

    case 'RESET_SUGGESTED_QUESTIONS':
      return { ...state, suggestedQuestions: [] };

    case 'RESET_UI_STATE':
      return {
        ...state,
        hasSubmitted: false,
        hasManuallyScrolled: false,
        showAnnouncementDialog: false,
      };

    default:
      return state;
  }
};

export const createInitialState = (
  initialVisibility: 'public' | 'private' = 'private',
  hasShownAnnouncementDialog: boolean = false,
): ChatState => ({
  hasSubmitted: false,
  hasManuallyScrolled: false,
  showAnnouncementDialog: false,
  hasShownAnnouncementDialog,
  commandDialogOpen: false,
  anyDialogOpen: false,
  suggestedQuestions: [],
  attachments: [],
  selectedVisibilityType: initialVisibility,
});
