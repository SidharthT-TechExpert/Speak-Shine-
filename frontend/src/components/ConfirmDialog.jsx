import { createContext, useContext, useState, useCallback } from "react";
import Modal from "./Modal.jsx";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  // Returns a promise — resolves true on confirm, false on cancel
  const confirm = useCallback(({ title, message, confirmText = "Confirm", type = "danger" }) => {
    return new Promise(resolve => {
      setDialog({
        title, message, confirmText, type,
        onConfirm: () => { setDialog(null); resolve(true); },
        onCancel:  () => { setDialog(null); resolve(false); },
      });
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <Modal
          type={dialog.type}
          title={dialog.title}
          message={dialog.message}
          confirmText={dialog.confirmText}
          onConfirm={dialog.onConfirm}
          onCancel={dialog.onCancel}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
