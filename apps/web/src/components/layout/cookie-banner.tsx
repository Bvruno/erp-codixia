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
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 pb-safe print:hidden">
      <div className="bg-background border shadow-lg rounded-lg p-4 mx-auto max-w-lg flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground flex-1">
          Usamos cookies para el funcionamiento de la plataforma. No recopilamos
          datos personales sin tu consentimiento.
        </p>
        <div className="flex flex-col-reverse gap-2 shrink-0 sm:flex-row">
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => decide("rejected")}
          >
            Rechazar
          </Button>
          <Button size="sm" className="w-full sm:w-auto" onClick={() => decide("accepted")}>
            Aceptar
          </Button>
        </div>
      </div>
    </div>
  );
}
