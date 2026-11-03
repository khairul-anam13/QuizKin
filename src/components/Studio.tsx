"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, hostKeyFor, store } from "@/lib/client";
import { emptyQuestion, LIMITS, OPTION_LETTERS, parseBulk, quizProblem, SAMPLE_QUIZ, TIME_CHOICES } from "@/lib/quiz";
import type { Question, Quiz } from "@/lib/types";
import { Check } from "./Icons";

type Saved = { id: string; updatedAt: number; quiz: Quiz };
const KEY = "qk:quizzes";
const newId = () => Math.random().toString(36).slice(2, 10);

export function Studio() {
  const router = useRouter();
  const [list, setList] = useState<Saved[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ item: Saved; index: number } | null>(null);

  useEffect(() => setList(store.get<Saved[]>(KEY) ?? []), []);
  useEffect(() => {
    if (list) store.set(KEY, list);
  }, [list]);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  if (!list) return <div className="studio-skeleton" aria-hidden />;

  const create = (quiz: Quiz) => {
    const item = { id: newId(), updatedAt: Date.now(), quiz: structuredClone(quiz) };
    setList([item, ...list]);
    setOpenId(item.id);
  };

  const update = (id: string, quiz: Quiz) =>
    setList((l) => l!.map((s) => (s.id === id ? { ...s, quiz, updatedAt: Date.now() } : s)));

  const remove = (id: string) => {
    const index = list.findIndex((s) => s.id === id);
    setUndo({ item: list[index], index });
    setList(list.filter((s) => s.id !== id));
    if (openId === id) setOpenId(null);
  };

  const launch = async (quiz: Quiz) => {
    setLaunching(true);
    setError(null);
    try {
      const { code, hostKey } = await api<{ code: string; hostKey: string }>("/api/rooms", quiz);
      store.set(hostKeyFor(code), hostKey);
      router.push(`/host/${code}`);
    } catch (e) {
      setError((e as Error).message);
      setLaunching(false);
    }
  };

  const open = list.find((s) => s.id === openId);

  return (
    <>
      {open ? (
        <QuizEditor
          key={open.id}
          quiz={open.quiz}
          launching={launching}
          error={error}
          onChange={(q) => update(open.id, q)}
          onBack={() => setOpenId(null)}
          onDelete={() => remove(open.id)}
          onLaunch={() => launch(open.quiz)}
        />
      ) : (
        <section className="studio-list">
          <div className="row-between">
            <h1 className="display-m">Kuis saya</h1>
            <button className="btn btn-primary" onClick={() => create({ title: "", questions: [emptyQuestion()] })}>
              Kuis baru
            </button>
          </div>

          {list.length === 0 ? (
            <div className="empty">
              <p>Belum ada kuis di perangkat ini. Mulai dari soal kosong, atau buka kuis contoh untuk melihat cara kerjanya.</p>
              <button className="btn btn-ghost" onClick={() => create(SAMPLE_QUIZ)}>
                Buka kuis contoh
              </button>
            </div>
          ) : (
            <ul className="quiz-list">
              {list.map((s) => {
                const problem = quizProblem(s.quiz);
                return (
                  <li key={s.id} className="quiz-item">
                    <button className="quiz-item-main" onClick={() => setOpenId(s.id)}>
                      <span className="quiz-item-title">{s.quiz.title || "Tanpa judul"}</span>
                      <span className="muted">
                        {s.quiz.questions.length} soal{problem ? ", belum lengkap" : ""}
                      </span>
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!!problem || launching}
                      onClick={() => launch(s.quiz)}
                    >
                      Mainkan
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <p className="muted small">Kuis disimpan di browser ini saja. Hapus data browser berarti kuis ikut hilang.</p>
        </section>
      )}

      {undo && (
        <div className="toast" role="status">
          <span>Kuis “{undo.item.quiz.title || "Tanpa judul"}” dihapus.</span>
          <button
            className="toast-action"
            onClick={() => {
              setList((l) => {
                const next = [...l!];
                next.splice(undo.index, 0, undo.item);
                return next;
              });
              setUndo(null);
            }}
          >
            Urungkan
          </button>
        </div>
      )}
    </>
  );
}

function QuizEditor(props: {
  quiz: Quiz;
  launching: boolean;
  error: string | null;
  onChange: (q: Quiz) => void;
  onBack: () => void;
  onDelete: () => void;
  onLaunch: () => void;
}) {
  const { quiz, onChange } = props;
  const bulkRef = useRef<HTMLDialogElement>(null);
  const problem = quizProblem(quiz);

  const setQuestion = (i: number, q: Question) =>
    onChange({ ...quiz, questions: quiz.questions.map((x, j) => (j === i ? q : x)) });

  const move = (i: number, dir: -1 | 1) => {
    const qs = [...quiz.questions];
    [qs[i], qs[i + dir]] = [qs[i + dir], qs[i]];
    onChange({ ...quiz, questions: qs });
  };

  const addQuestions = (extra: Question[]) => {
    // Replace the untouched starter question instead of leaving a blank one at the top.
    const kept = quiz.questions.filter((q) => q.text.trim() || q.options.some((o) => o.trim()));
    onChange({ ...quiz, questions: [...kept, ...extra].slice(0, LIMITS.questions) });
  };

  return (
    <section className="editor">
      <div className="row-between">
        <button className="btn btn-ghost btn-sm" onClick={props.onBack}>
          Kembali
        </button>
        <button className="btn btn-ghost btn-sm danger-text" onClick={props.onDelete}>
          Hapus kuis
        </button>
      </div>

      <label className="field">
        <span className="field-label">Judul kuis</span>
        <input
          className="input input-title"
          value={quiz.title}
          maxLength={LIMITS.title}
          placeholder="Misalnya: Ulangan IPA Bab 3"
          onChange={(e) => onChange({ ...quiz, title: e.target.value })}
        />
      </label>

      <ol className="q-list">
        {quiz.questions.map((q, i) => (
          <QuestionCard
            key={i}
            index={i}
            q={q}
            count={quiz.questions.length}
            onChange={(next) => setQuestion(i, next)}
            onMove={(dir) => move(i, dir)}
            onDuplicate={() => {
              const qs = [...quiz.questions];
              qs.splice(i + 1, 0, structuredClone(q));
              onChange({ ...quiz, questions: qs.slice(0, LIMITS.questions) });
            }}
            onRemove={() => onChange({ ...quiz, questions: quiz.questions.filter((_, j) => j !== i) })}
          />
        ))}
      </ol>

      <div className="editor-add">
        <button
          className="btn btn-ghost"
          disabled={quiz.questions.length >= LIMITS.questions}
          onClick={() => onChange({ ...quiz, questions: [...quiz.questions, emptyQuestion()] })}
        >
          Tambah soal
        </button>
        <button className="btn btn-ghost" onClick={() => bulkRef.current?.showModal()}>
          Tempel banyak soal
        </button>
      </div>

      <BulkDialog ref={bulkRef} onAdd={addQuestions} />

      <div className="dock">
        <p className={problem || props.error ? "dock-note error" : "dock-note"} role="status">
          {props.error ?? problem ?? `${quiz.questions.length} soal siap dimainkan.`}
        </p>
        <button className="btn btn-primary btn-block" disabled={!!problem || props.launching} onClick={props.onLaunch}>
          {props.launching ? "Membuka ruangan…" : "Mulai sesi"}
        </button>
      </div>
    </section>
  );
}

function QuestionCard(props: {
  index: number;
  q: Question;
  count: number;
  onChange: (q: Question) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { q, index, onChange } = props;

  const removeOption = (i: number) => {
    const options = q.options.filter((_, j) => j !== i);
    const correct = q.correct === i ? 0 : q.correct > i ? q.correct - 1 : q.correct;
    onChange({ ...q, options, correct });
  };

  return (
    <li className="q-card">
      <div className="q-head">
        <span className="q-num" aria-label={`Soal ${index + 1}`}>
          {index + 1}
        </span>
        <label className="q-time">
          <span className="sr-only">Waktu menjawab</span>
          <select
            className="select"
            value={q.time}
            onChange={(e) => onChange({ ...q, time: Number(e.target.value) })}
          >
            {TIME_CHOICES.map((t) => (
              <option key={t} value={t}>
                {t} detik
              </option>
            ))}
          </select>
        </label>
        <div className="q-tools">
          <button className="icon-btn" aria-label="Naikkan soal" disabled={index === 0} onClick={() => props.onMove(-1)}>
            <Chevron up />
          </button>
          <button
            className="icon-btn"
            aria-label="Turunkan soal"
            disabled={index === props.count - 1}
            onClick={() => props.onMove(1)}
          >
            <Chevron />
          </button>
          <button className="icon-btn" aria-label="Gandakan soal" onClick={props.onDuplicate}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <rect x="8" y="8" width="12" height="12" rx="2" />
              <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
            </svg>
          </button>
          <button className="icon-btn" aria-label="Hapus soal" disabled={props.count === 1} onClick={props.onRemove}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <textarea
        className="input q-text"
        rows={2}
        value={q.text}
        maxLength={LIMITS.question}
        placeholder="Tulis pertanyaannya"
        onChange={(e) => onChange({ ...q, text: e.target.value })}
      />

      <div className="opt-edit-list">
        {q.options.map((o, i) => (
          <div className="opt-edit" key={i} data-correct={q.correct === i}>
            <button
              type="button"
              className="opt-letter"
              data-opt={i}
              aria-pressed={q.correct === i}
              aria-label={`Tandai ${OPTION_LETTERS[i]} sebagai jawaban benar`}
              onClick={() => onChange({ ...q, correct: i })}
            >
              {q.correct === i ? <Check /> : OPTION_LETTERS[i]}
            </button>
            <input
              className="input"
              value={o}
              maxLength={LIMITS.option}
              placeholder={`Pilihan ${OPTION_LETTERS[i]}`}
              onChange={(e) => onChange({ ...q, options: q.options.map((x, j) => (j === i ? e.target.value : x)) })}
            />
            {q.options.length > 2 && (
              <button className="icon-btn" aria-label={`Hapus pilihan ${OPTION_LETTERS[i]}`} onClick={() => removeOption(i)}>
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M7 12h10" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="row-between">
        <span className="muted small">Ketuk huruf untuk menandai jawaban benar.</span>
        {q.options.length < 4 && (
          <button className="link-btn" onClick={() => onChange({ ...q, options: [...q.options, ""] })}>
            Tambah pilihan
          </button>
        )}
      </div>
    </li>
  );
}

function BulkDialog({ ref, onAdd }: { ref: React.Ref<HTMLDialogElement>; onAdd: (qs: Question[]) => void }) {
  const [text, setText] = useState("");
  const parsed = parseBulk(text);

  return (
    <dialog ref={ref} className="sheet" onClose={() => setText("")}>
      <form method="dialog" className="sheet-body">
        <h2 className="display-s">Tempel banyak soal</h2>
        <p className="muted">
          Satu soal per paragraf: baris pertama pertanyaan, baris berikutnya pilihan. Beri tanda * di depan jawaban
          yang benar.
        </p>
        <pre className="bulk-example">{`Ibu kota Jawa Barat adalah
Semarang
* Bandung
Surabaya

Hasil 7 × 8
54
* 56`}</pre>
        <textarea
          className="input"
          rows={8}
          value={text}
          placeholder="Tempel soal di sini"
          onChange={(e) => setText(e.target.value)}
        />
        <div className="sheet-actions">
          <button className="btn btn-ghost" value="cancel">
            Batal
          </button>
          <button className="btn btn-primary" disabled={parsed.length === 0} onClick={() => onAdd(parsed)}>
            {parsed.length ? `Tambahkan ${parsed.length} soal` : "Belum ada soal terbaca"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Chevron({ up }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}
