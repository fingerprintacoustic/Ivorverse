import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { blobToBase64, useAudioRecorder } from "@/hooks/useAudioRecorder";
import { trpc } from "@/lib/trpc";
import { Copy, Download, Loader2, Mic, Square, Trash2, Upload, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Keep in sync with TTS_VOICES in server/_core/textToSpeech.ts
const VOICES = [
  "alloy", "ash", "ballad", "coral", "echo", "fable", "nova",
  "onyx", "sage", "shimmer", "verse", "marin", "cedar",
] as const;
type Voice = (typeof VOICES)[number];

const MAX_AUDIO_BYTES = 7.5 * 1024 * 1024; // matches voice.uploadAudio's base64 cap
const MAX_TTS_CHARS = 4096;

function formatSeconds(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function downloadAudio(url: string, filename: string) {
  try {
    const blob = await (await fetch(url)).blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Cross-origin fetch blocked by storage CORS; let the browser handle it
    window.open(url, "_blank", "noopener");
  }
}

function VoicePicker({ value, onChange }: { value: Voice; onChange: (v: Voice) => void }) {
  return (
    <div className="space-y-2">
      <Label>Voice</Label>
      <Select value={value} onValueChange={(v) => onChange(v as Voice)}>
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VOICES.map((v) => (
            <SelectItem key={v} value={v} className="capitalize">
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Uploads a recorded/picked audio blob and returns its storage URL. */
function useAudioUpload() {
  const uploadMutation = trpc.voice.uploadAudio.useMutation();
  const upload = async (blob: Blob, filename?: string) => {
    if (blob.size > MAX_AUDIO_BYTES) {
      throw new Error("Audio is larger than 7.5MB — record or upload a shorter clip");
    }
    const { url } = await uploadMutation.mutateAsync({
      fileData: await blobToBase64(blob),
      mimeType: blob.type || "audio/webm",
      filename,
    });
    return url;
  };
  return { upload, isUploading: uploadMutation.isPending };
}

type Turn = { role: "user" | "assistant"; content: string; audioUrl?: string };

function ConversationTab() {
  const recorder = useAudioRecorder();
  const { upload, isUploading } = useAudioUpload();
  const converseMutation = trpc.voice.converse.useMutation();
  const [voice, setVoice] = useState<Voice>("coral");
  const [turns, setTurns] = useState<Turn[]>([]);
  const replyAudioRef = useRef<HTMLAudioElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isBusy = isUploading || converseMutation.isPending;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, isBusy]);

  const handleMicClick = async () => {
    try {
      if (!recorder.isRecording) {
        replyAudioRef.current?.pause();
        await recorder.start();
        return;
      }
      const blob = await recorder.stop();
      const audioUrl = await upload(blob);
      const result = await converseMutation.mutateAsync({
        audioUrl,
        voice,
        history: turns.slice(-20).map(({ role, content }) => ({ role, content })),
      });
      setTurns((prev) => [
        ...prev,
        { role: "user", content: result.transcript },
        { role: "assistant", content: result.reply, audioUrl: result.replyAudioUrl },
      ]);
      if (replyAudioRef.current) {
        replyAudioRef.current.src = result.replyAudioUrl;
        replyAudioRef.current.play().catch(() => {
          // Autoplay blocked — the reply still has its own player below
        });
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice Conversation</CardTitle>
        <CardDescription>
          Tap the mic, speak, then tap again. The AI replies out loud.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <VoicePicker value={voice} onChange={setVoice} />
          {turns.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setTurns([])} disabled={isBusy}>
              <Trash2 className="w-4 h-4 mr-2" />
              Clear conversation
            </Button>
          )}
        </div>

        <div className="space-y-3 max-h-[28rem] overflow-y-auto">
          {turns.length === 0 && !isBusy && (
            <p className="text-center text-sm text-muted-foreground py-8">
              Your conversation will appear here.
            </p>
          )}
          {turns.map((turn, i) => (
            <div
              key={i}
              className={`rounded-lg p-3 text-sm max-w-[85%] ${
                turn.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              <p className="whitespace-pre-wrap">{turn.content}</p>
              {turn.audioUrl && <audio controls src={turn.audioUrl} className="w-full mt-2 h-8" />}
            </div>
          ))}
          {isBusy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {isUploading ? "Uploading…" : "Listening and thinking…"}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex flex-col items-center gap-2">
          <Button
            size="lg"
            className="rounded-full w-16 h-16"
            variant={recorder.isRecording ? "destructive" : "default"}
            onClick={handleMicClick}
            disabled={isBusy}
            aria-label={recorder.isRecording ? "Stop and send" : "Start speaking"}
          >
            {recorder.isRecording ? <Square className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {recorder.isRecording ? `Recording ${formatSeconds(recorder.elapsedSeconds)} — tap to send` : "Tap to speak"}
          </span>
        </div>
        <audio ref={replyAudioRef} className="hidden" />
      </CardContent>
    </Card>
  );
}

function TranscribeTab() {
  const recorder = useAudioRecorder();
  const { upload, isUploading } = useAudioUpload();
  const transcribeMutation = trpc.voice.transcribe.useMutation();
  const [transcript, setTranscript] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isBusy = isUploading || transcribeMutation.isPending;

  const transcribeBlob = async (blob: Blob, filename?: string) => {
    try {
      setTranscript(null);
      const audioUrl = await upload(blob, filename);
      const result = await transcribeMutation.mutateAsync({ audioUrl });
      setTranscript(result.text);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const handleRecordClick = async () => {
    try {
      if (recorder.isRecording) {
        await transcribeBlob(await recorder.stop());
      } else {
        await recorder.start();
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    await transcribeBlob(file, file.name);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transcribe Audio</CardTitle>
        <CardDescription>Record from your microphone or upload an audio file (up to 7.5MB).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            onClick={handleRecordClick}
            disabled={isBusy}
            variant={recorder.isRecording ? "destructive" : "default"}
          >
            {recorder.isRecording ? (
              <>
                <Square className="w-4 h-4 mr-2" />
                Stop ({formatSeconds(recorder.elapsedSeconds)})
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 mr-2" />
                Record
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy || recorder.isRecording}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload file
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/mp4,video/webm"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>

        {isBusy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {isUploading ? "Uploading…" : "Transcribing…"}
          </div>
        )}

        {transcript !== null && (
          <div className="bg-muted p-4 rounded-lg space-y-4">
            <h3 className="font-semibold">Transcription</h3>
            <p className="text-sm whitespace-pre-wrap">{transcript || "(no speech detected)"}</p>
            <Button
              className="w-full"
              variant="outline"
              disabled={!transcript}
              onClick={() =>
                navigator.clipboard
                  .writeText(transcript)
                  .then(() => toast.success("Copied to clipboard"))
                  .catch(() => toast.error("Couldn't access the clipboard"))
              }
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Text
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GenerateSpeechTab() {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<Voice>("coral");
  const [instructions, setInstructions] = useState("");
  const speechMutation = trpc.voice.generateSpeech.useMutation({
    onError: (error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Speech</CardTitle>
        <CardDescription>Convert text to natural-sounding speech.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            placeholder="Enter text to convert to speech..."
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_TTS_CHARS))}
            rows={5}
          />
          <p className="text-xs text-muted-foreground text-right tabular-nums">
            {text.length} / {MAX_TTS_CHARS}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <VoicePicker value={voice} onChange={setVoice} />
          <div className="space-y-2">
            <Label htmlFor="tts-instructions">Delivery (optional)</Label>
            <Input
              id="tts-instructions"
              placeholder="e.g. Speak warmly, like a late-night radio host"
              value={instructions}
              maxLength={500}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>
        </div>
        <Button
          onClick={() =>
            speechMutation.mutate({ text, voice, instructions: instructions.trim() || undefined })
          }
          disabled={!text.trim() || speechMutation.isPending}
          className="w-full"
        >
          {speechMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Volume2 className="w-4 h-4 mr-2" />
              Generate Speech
            </>
          )}
        </Button>

        {speechMutation.data && (
          <div className="bg-muted p-4 rounded-lg space-y-4">
            <h3 className="font-semibold">Generated Audio</h3>
            <audio controls src={speechMutation.data.audioUrl} className="w-full" />
            <Button
              className="w-full"
              variant="outline"
              onClick={() => downloadAudio(speechMutation.data!.audioUrl, "speech.mp3")}
            >
              <Download className="w-4 h-4 mr-2" />
              Download Audio
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function VoiceFeature() {
  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Voice Studio</h1>
          <p className="text-muted-foreground mt-2">
            Talk with the AI, transcribe audio, and generate speech
          </p>
        </div>

        <Tabs defaultValue="conversation" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="conversation">Conversation</TabsTrigger>
            <TabsTrigger value="transcribe">Transcribe</TabsTrigger>
            <TabsTrigger value="generate">Generate Speech</TabsTrigger>
          </TabsList>
          <TabsContent value="conversation" forceMount className="space-y-4 data-[state=inactive]:hidden">
            <ConversationTab />
          </TabsContent>
          <TabsContent value="transcribe" forceMount className="space-y-4 data-[state=inactive]:hidden">
            <TranscribeTab />
          </TabsContent>
          <TabsContent value="generate" forceMount className="space-y-4 data-[state=inactive]:hidden">
            <GenerateSpeechTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
