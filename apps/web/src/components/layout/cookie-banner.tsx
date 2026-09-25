"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const CONSENT_KEY = "cookie-consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (stored !== "accepted" && stored !== "rejected") {
        setVisible(true);
      }
    }, 500);
    return () => clearTimeout(t);
  }, []);

  const decide = (value: "accepted" | "rejected") => {
    localStorage.setItem(CONSENT_KEY, value);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 sm:right-auto sm:w-96 print:hidden">
      <div className="bg-card border shadow-popover rounded-xl p-4">
        <p className="text-sm text-muted-foreground">
          Usamos cookies para el funcionamiento de la plataforma. No recopilamos
          datos personales sin tu consentimiento.
        </p>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => decide("rejected")}
          >
            Rechazar
          </Button>
          <Button size="sm" onClick={() => decide("accepted")}>
            Aceptar
          </Button>
        </div>
      </div>
    </div>
  );
}
