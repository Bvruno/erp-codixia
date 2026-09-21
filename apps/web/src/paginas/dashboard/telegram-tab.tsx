"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiFetch } from "@/lib/api/cliente";
import { API_URL } from "@/lib/api/base";
import { TTL_CACHE } from "@/lib/cache-claves";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Save, Eye, EyeOff, Send, Wifi } from "lucide-react";
import { toast } from "sonner";
import type { TelegramConfig } from "@/types";

interface Props {
  orgId: string;
}

export function TelegramTab({ orgId }: Props) {
  const [config, setConfig] = useState<TelegramConfig | null>(null);
  const [botToken, setBotToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [chatId, setChatId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [botInfo, setBotInfo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: ['organizacion', 'telegram', orgId],
    queryFn: () =>
      apiFetch<{ config: TelegramConfig | null; chat_id: string | null }>(
        `/perfil/telegram-config?organization_id=${encodeURIComponent(orgId)}`
      ),
    staleTime: TTL_CACHE.catalogo,
    refetchOnWindowFocus: false,
  });
  const loading = configQuery.isPending;
  useEffect(() => {
    if (configQuery.isError) toast.error("No se pudo cargar la configuración de Telegram");
  }, [configQuery.isError]);
  /* eslint-disable react-hooks/set-state-in-effect -- Sync de query a estado de formulario */
  useEffect(() => {
    const res = configQuery.data;
    if (!res) return;
    if (res.config) {
      setConfig(res.config);
      setBotToken(res.config.bot_token);
      setEnabled(res.config.enabled);
    }
    setChatId(res.chat_id ?? null);
  }, [configQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const invalidarConfig = () => {
    void queryClient.invalidateQueries({ queryKey: ['organizacion', 'telegram', orgId] });
  };

  const testConnection = async () => {
    if (!botToken.trim()) return;
    setTesting(true);
    setBotInfo(null);
    try {
      const res = await fetch(`${API_URL}/telegram/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_token: botToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Token inválido");
      } else {
        setBotInfo(`@${data.bot.username} (${data.bot.name})`);
        toast.success("Conexión exitosa");
      }
    } catch {
      toast.error("No se pudo probar la conexión");
    } finally {
      setTesting(false);
    }
  };

  const saveConfig = async () => {
    if (!botToken.trim()) {
      toast.error("El token es obligatorio");
      return;
    }
    setSaving(true);
    const before = config;
    try {
      await api.put("/perfil/telegram-config", {
        organization_id: orgId,
        bot_token: botToken.trim(),
        enabled,
      });
      await api.post("/auditoria", {
        organization_id: orgId,
        action: "update_telegram",
        entity: "telegram_config",
        before,
        after: { bot_token: botToken.trim().slice(-4), enabled },
      }).catch(() => undefined);
      toast.success("Configuración guardada");
      invalidarConfig();
    } catch {
      toast.error("No se pudo guardar la configuración");
    }
    setSaving(false);
  };

  const sendTestNotification = async () => {
    if (!chatId) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/telegram/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_token: botToken.trim(),
          chat_id: chatId,
          text: "­ƒöö Notificación de prueba desde Caroline Salas",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "No se pudo enviar la notificación");
      } else {
        toast.success("Notificación enviada");
      }
    } catch {
      toast.error("No se pudo enviar la notificación");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground">
        Cargando...
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bot de Telegram</CardTitle>
        <CardDescription>
          Configura un bot para recibir notificaciones de tareas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Bot Token</Label>
          <div className="flex gap-2">
            <Input
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              type={showToken ? "text" : "password"}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowToken((v) => !v)}
              aria-label={showToken ? "Ocultar token" : "Mostrar token"}
            >
              {showToken ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </Button>
          </div>
          {config && !showToken && botToken && (
            <p className="text-muted-foreground text-xs">
              Token guardado, termina en {botToken.slice(-4)}
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            Obtén el token de{" "}
            <code className="bg-muted px-1 py-0.5 rounded">@BotFather</code> en
            Telegram
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="telegram-enabled"
            checked={enabled}
            onCheckedChange={(v) => setEnabled(v === true)}
          />
          <Label htmlFor="telegram-enabled">Notificaciones habilitadas</Label>
        </div>

        {chatId ? (
          <p className="text-muted-foreground text-xs">
            Chat vinculado: {chatId}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Tu chat aún no está vinculado. Usa el bot con /start para recibir
            notificaciones personales.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={saveConfig} disabled={saving || !botToken.trim()}>
            <Save className="size-4" />
            Guardar Configuración
          </Button>
          <Button
            variant="outline"
            onClick={testConnection}
            disabled={testing || !botToken.trim()}
          >
            <Wifi className="size-4" />
            {testing ? "Probando..." : "Probar Conexión"}
          </Button>
          <Button
            variant="outline"
            onClick={sendTestNotification}
            disabled={sending || !botToken.trim() || !chatId}
          >
            <Send className="size-4" />
            Notificación de Prueba
          </Button>
        </div>

        {botInfo && (
          <p className="text-muted-foreground text-sm">
            Conectado como <span className="font-medium">{botInfo}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
