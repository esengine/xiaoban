import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

interface Job {
  id: string;
  width: number;
}

const HEIGHT = 800;

export function PageCheckHost() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const frames = useRef(new Map<string, HTMLIFrameElement>());

  useEffect(() => {
    const stop = listen<Job>("page-check", (event) => {
      setJobs((current) => [...current, event.payload]);
    });
    return () => void stop.then((unlisten) => unlisten());
  }, []);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const data = event.data as { xbCheck?: string } | null;
      if (!data || typeof data.xbCheck !== "string") return;
      for (const [id, frame] of frames.current) {
        if (frame.contentWindow !== event.source) continue;
        let report: unknown = {};
        try {
          report = JSON.parse(data.xbCheck);
        } catch {
          report = { errors: ["the check script sent an unreadable report"] };
        }
        void invoke("page_check_done", { id, report }).catch(() => undefined);
        frames.current.delete(id);
        setJobs((current) => current.filter((job) => job.id !== id));
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  return (
    <div className="page-check-host" aria-hidden="true">
      {jobs.map((job) => (
        <iframe
          key={job.id}
          title={job.id}
          tabIndex={-1}
          sandbox="allow-scripts allow-forms"
          src={convertFileSrc(job.id, "xbpage")}
          style={{ width: job.width, height: HEIGHT }}
          ref={(frame) => {
            if (frame) frames.current.set(job.id, frame);
          }}
        />
      ))}
    </div>
  );
}
