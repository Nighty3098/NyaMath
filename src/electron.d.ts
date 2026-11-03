interface NativeMenuItem {
  id?: string;
  label?: string;
  type?: 'normal' | 'separator';
  enabled?: boolean;
  checked?: boolean;
  accelerator?: string;
  submenu?: NativeMenuItem[];
}

interface NativeMenu {
  label: string;
  items: NativeMenuItem[];
}

interface NativeMenuTemplate {
  editLabel: string;
  undoLabel: string;
  redoLabel: string;
  menus: NativeMenu[];
}

interface Window {
  nyaElectron?: {
    platform: NodeJS.Platform;
    setNativeMenu: (template: NativeMenuTemplate) => void;
    onNativeMenuAction: (callback: (id: string) => void) => () => void;
    windowControls: {
      getMaximized: () => Promise<boolean>;
      minimize: () => void;
      toggleMaximize: () => void;
      close: () => void;
      onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
    };
  };
}
