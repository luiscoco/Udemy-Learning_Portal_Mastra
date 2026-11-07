import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  getModule,
  MILESTONE_PROJECTS,
  PROJECT_TOPICS,
  projectById,
  questionShortcuts,
  stagePrompt,
  type MilestoneProject,
  type ProjectTopic,
} from '@mlp/lab-catalog';
import type { LabDefinition } from '@mlp/contracts';
import { api } from '../api/client';
import { PageHeading } from '../components/PageHeading';
import { Button } from '../components/ui/primitives';
import { CodeBlock } from '../components/workspace/CodeBlock';
import { FormattedResponse } from '../components/workspace/FormattedResponse';
import { useAllProgress } from '../lib/progress-context';
import { useStorageScope } from '../lib/progress-scope';
import { useDocumentTitle } from '../lib/use-document-title';
import { useAsync } from '../lib/use-async';
import { downloadText, copyText } from '../lib/download';
import { NotFoundPage } from './NotFoundPage';
import { projectStorageKey, useProjectState, type ProjectState } from '../features/projects/state';
import { starterZip, downloadBytes } from '../features/projects/starters';
import { ProjectAnswer } from '../features/projects/ProjectAnswer';
import { EvaluationStudio } from '../features/projects/EvaluationStudio';
import { PublishingStudio } from '../features/projects/PublishingStudio';
import '../features/projects/projects.css';

type UpdateProject = (fn: (state: ProjectState) => ProjectState) => void;
export function ProjectsPage() {
  useDocumentTitle('Milestone projects');
  const progress = useAllProgress();
  return (
    <div className="project-stack">
      <section className="portal-hero project-panel">
        <p className="project-eyebrow">Understand - Test - Produce</p>
        <PageHeading>Milestone projects</PageHeading>
        <p>
          Turn the Mastra course into three working applications. Follow 22 cumulative build stages, compare the reference
          workspaces and collect evidence of your own implementation.
        </p>
        <p>
          Project practice is independent of the 75 course labs. Opening a reference never completes a lesson. These workspaces
          share the portal's local server, learner session and theme.
        </p>
      </section>
      <div className="project-cards">
        {MILESTONE_PROJECTS.map((project) => {
          const labs = [...new Set(project.stages.flatMap((s) => s.labs))];
          return (
            <section className="project-panel" key={project.id}>
              <p className="project-eyebrow">
                {project.stages[0]?.id}-{project.stages.at(-1)?.id}
              </p>
              <h2>{project.title}</h2>
              <p className="project-subtitle">{project.subtitle}</p>
              <p>{project.outcome}</p>
              <p>
                {labs.filter((id) => progress[id]?.status === 'completed').length} of {labs.length} related labs completed. You
                can preview the project at any time.
              </p>
              <Link className="project-link" to={'/projects/' + project.id}>
                Open {project.title}
              </Link>
              <ul>
                {project.stages.map((s) => (
                  <li key={s.id}>
                    {s.id}: {s.title}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <section className="project-panel">
        <h2>Build with evidence</h2>
        <ol>
          <li>Read the stage prompt and review its linked lessons.</li>
          <li>Download the learner starter and implement the stage in your own local workspace.</li>
          <li>Run offline tests, inspect output and record acceptance evidence.</li>
          <li>Use live mode only after configuring a provider and explicitly authorizing the call.</li>
        </ol>
        <p>
          The previews are working examples, not proof that your own implementation passes. JSON backups contain project work and
          should be stored privately.
        </p>
      </section>
    </div>
  );
}
export function ProjectPage() {
  const { projectId = '' } = useParams();
  const project = projectById(projectId);
  const scope = useStorageScope();
  useDocumentTitle(project?.title ?? 'Project not found');
  return project ? (
    <ProjectView key={scope + ':' + project.id} project={project} scope={scope} />
  ) : (
    <NotFoundPage what="project" />
  );
}
function ProjectView({ project, scope }: { project: MilestoneProject; scope: string }) {
  const { data, warning, update } = useProjectState(projectStorageKey(scope, project.id));
  const [topicId, setTopicId] = useState(project.id === 'evaluation-studio' ? 'lab-06' : 'llm');
  const topics = project.id === 'evaluation-studio' ? PROJECT_TOPICS.filter((t) => !t.introduction) : PROJECT_TOPICS;
  const topic = topics.find((t) => t.id === topicId) ?? topics[0]!;
  const [downloadError, setDownloadError] = useState('');
  const stageChecks = project.stages.flatMap((step) => step.evidence.map((_, i) => step.id + ':' + i));
  return (
    <article className="project-workspace project-stack" style={{ fontSize: Number(data.textSize) / 100 + 'rem' }}>
      <section className="portal-hero project-panel">
        <Link to="/projects">All milestone projects</Link>
        <p className="project-eyebrow">{project.subtitle}</p>
        <PageHeading>{project.title}</PageHeading>
        <p>{project.outcome}</p>
        <div className="project-actions">
          <Button
            variant="secondary"
            onClick={() => {
              try {
                downloadBytes(project.id + '-learner.zip', starterZip(project), 'application/zip');
              } catch {
                setDownloadError('Starter download failed. Retry or copy the stage prompts below.');
              }
            }}
          >
            Download learner starter
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              downloadText(
                project.id + '-evidence.json',
                JSON.stringify({ projectId: project.id, learnerScope: scope, ...data }, null, 2),
                'application/json',
              )
            }
          >
            Export project evidence
          </Button>
          <label>
            Project text size
            <select
              value={data.textSize}
              onChange={(e) => update((old) => ({ ...old, textSize: e.target.value as ProjectState['textSize'] }))}
            >
              {['100', '110', '125', '150'].map((size) => (
                <option key={size} value={size}>
                  {size}%
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>
          Saved for this learner in this browser. This does not sync project evidence to another device or change course
          completion.
        </p>
        {(warning || downloadError) && <p role="alert">{warning || downloadError}</p>}
      </section>
      <details className="project-panel">
        <summary>
          Build stages and evidence - {stageChecks.filter((id) => data.stages[id]).length} of {stageChecks.length} criteria
          reviewed
        </summary>
        <p>
          Self-review only. Check a criterion after inspecting your own implementation; a preview or generated answer is not a
          passed submission.
        </p>
        <StageGuide project={project} data={data} update={update} />
        <label>
          Project notes
          <textarea
            aria-label="Project notes"
            rows={4}
            maxLength={20000}
            value={data.notes}
            onChange={(e) => update((old) => ({ ...old, notes: e.target.value }))}
          />
        </label>
      </details>
      <TopicPicker topics={topics} selected={topic} onSelect={setTopicId} />
      <ProjectLesson key={project.id + ':' + topic.id} project={project} topic={topic} data={data} update={update} />
    </article>
  );
}
function StageGuide({ project, data, update }: { project: MilestoneProject; data: ProjectState; update: UpdateProject }) {
  const [index, setIndex] = useState(0);
  const [copyStatus, setCopyStatus] = useState('');
  const stage = project.stages[index]!;
  return (
    <div className="project-stack">
      <label>
        Build stage
        <select
          value={index}
          onChange={(e) => {
            setIndex(Number(e.target.value));
            setCopyStatus('');
          }}
        >
          {project.stages.map((s, i) => (
            <option key={s.id} value={i}>
              {s.id}: {s.title}
            </option>
          ))}
        </select>
      </label>
      <h2>
        {stage.id}: {stage.title}
      </h2>
      <p>{stage.goal}</p>
      <div className="project-actions">
        {stage.labs.map((id) => (
          <Link key={id} to={'/labs/' + id}>
            {id}
          </Link>
        ))}
      </div>
      {stage.evidence.map((criterion, i) => (
        <label className="project-check" key={criterion}>
          <input
            type="checkbox"
            checked={data.stages[stage.id + ':' + i] ?? false}
            onChange={(e) => update((old) => ({ ...old, stages: { ...old.stages, [stage.id + ':' + i]: e.target.checked } }))}
          />
          {criterion}
        </label>
      ))}
      <CodeBlock code={stagePrompt(project, stage)} language="markdown" label={stage.id + ' build prompt'} />
      <div className="project-actions">
        <Button
          variant="secondary"
          onClick={() =>
            void copyText(stagePrompt(project, stage)).then((ok) =>
              setCopyStatus(ok ? 'Build prompt copied' : 'Select the prompt text to copy it.'),
            )
          }
        >
          Copy build prompt
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            downloadText(stage.id.toLowerCase() + '-' + project.id + '.md', stagePrompt(project, stage), 'text/markdown')
          }
        >
          Download build prompt
        </Button>
        <Button variant="ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          Previous stage
        </Button>
        <Button variant="ghost" disabled={index === project.stages.length - 1} onClick={() => setIndex(index + 1)}>
          Next stage
        </Button>
      </div>
      <p role="status">{copyStatus}</p>
    </div>
  );
}
function TopicPicker({
  topics,
  selected,
  onSelect,
}: {
  topics: ProjectTopic[];
  selected: ProjectTopic;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('all');
  const label = (id: string) => getModule(id)?.title ?? id;
  const filtered = topics.filter(
    (t) =>
      (section === 'all' || t.section === section) &&
      (t.title + ' ' + t.id + ' ' + label(t.section)).toLowerCase().includes(query.toLowerCase()),
  );
  const index = filtered.findIndex((t) => t.id === selected.id);
  return (
    <section className="project-panel">
      <h2>Guided learning path</h2>
      <p>
        {topics.length} topics across {new Set(topics.map((t) => t.section)).size} sections. Counts describe learning activities,
        not distinct framework features.
      </p>
      <div className="project-grid">
        <label>
          Find a project topic
          <input type="search" value={query} maxLength={150} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          Topic section
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="all">All sections</option>
            {[...new Set(topics.map((t) => t.section))].map((id) => (
              <option key={id} value={id}>
                {label(id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Project topic
          <select aria-label="Project topic" value={index < 0 ? '' : selected.id} onChange={(e) => onSelect(e.target.value)}>
            {index < 0 && <option value="">Choose a matching topic</option>}
            {filtered.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id}: {t.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>
        {filtered.length} matching topics.{' '}
        {index < 0
          ? 'Current topic remains ' + selected.title + '; choose a result to change it.'
          : index + 1 + ' of ' + filtered.length}
      </p>
      <div className="project-actions">
        <Button variant="secondary" disabled={index <= 0} onClick={() => onSelect(filtered[index - 1]!.id)}>
          Previous topic
        </Button>
        <Button
          variant="secondary"
          disabled={!filtered.length || index >= filtered.length - 1}
          onClick={() => onSelect(filtered[index + 1]!.id)}
        >
          Next topic
        </Button>
      </div>
    </section>
  );
}
function ProjectLesson({
  project,
  topic,
  data,
  update,
}: {
  project: MilestoneProject;
  topic: ProjectTopic;
  data: ProjectState;
  update: UpdateProject;
}) {
  const state = useAsync(topic.labId, (signal) => api.labs.get(topic.labId, signal));
  if (state.status === 'loading') return <p role="status">Loading project lesson...</p>;
  if (state.status === 'error')
    return (
      <section className="project-panel" role="alert">
        <p>Project lesson unavailable: {state.error.message}</p>
        <Button onClick={state.retry}>Retry project lesson</Button>
      </section>
    );
  const definition = state.data;
  if (project.id === 'evaluation-studio') return <EvaluationStudio definition={definition} data={data} update={update} />;
  if (project.id === 'publishing-studio')
    return <PublishingStudio definition={definition} topic={topic} data={data} update={update} />;
  return (
    <div className="project-stack">
      <section className="project-panel">
        <p className="project-eyebrow">{topic.labId} - tested course teaching</p>
        <h2>{topic.title}</h2>
        {topic.introduction && <p>{topic.introduction}</p>}
        <FormattedResponse text={definition.concept} />
        <ul>
          {definition.objectives.map((goal) => (
            <li key={goal}>{goal}</li>
          ))}
        </ul>
        <Link to={'/labs/' + definition.id}>Apply this concept in {definition.id}</Link>
        <SourceInspection definition={definition} />
      </section>
      <ProjectAnswer
        definition={definition}
        topic={topic.title}
        initialQuestion={questionShortcuts(topic.title)[0]!}
        shortcuts={questionShortcuts(topic.title)}
      />
      <Recognition key={topic.id} definition={definition} topic={topic} data={data} update={update} />
    </div>
  );
}
function SourceInspection({ definition }: { definition: LabDefinition }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <Button variant="secondary" onClick={() => setOpen(!open)}>
        {open ? 'Hide linked source' : 'Inspect linked source'}
      </Button>
      {open && <SourceFiles labId={definition.id} />}
    </div>
  );
}
function SourceFiles({ labId }: { labId: string }) {
  const state = useAsync(labId, (signal) => api.labs.source(labId, signal));
  if (state.status === 'loading') return <p role="status">Loading tested source...</p>;
  if (state.status === 'error')
    return (
      <p role="alert">
        Source unavailable. <Button onClick={state.retry}>Retry source</Button>
      </p>
    );
  return (
    <div>
      <p>Reference implementation for comparison; reading it is not a completed exercise.</p>
      {state.data.files.map((file) => (
        <details key={file.path}>
          <summary>
            {labId}/{file.path}
          </summary>
          <CodeBlock code={file.code} language={file.language} label={labId + '/' + file.path} copyable />
        </details>
      ))}
      <p>
        Tested versions:{' '}
        {Object.entries(state.data.pinned)
          .map(([name, version]) => name + ' ' + version)
          .join(', ')}
      </p>
    </div>
  );
}
function Recognition({
  definition,
  topic,
  data,
  update,
}: {
  definition: LabDefinition;
  topic: ProjectTopic;
  data: ProjectState;
  update: UpdateProject;
}) {
  const question = definition.quiz[0]!;
  const [answer, setAnswer] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  return (
    <section className="project-panel">
      <h2>Recognition check</h2>
      <p>
        Recognition is practice evidence, not a completed lab.{' '}
        {data.recognition[topic.id] ? 'Previously answered correctly in this project.' : ''}
      </p>
      <fieldset>
        <legend>{question.prompt}</legend>
        {question.choices.map((choice, i) => (
          <label className="project-check" key={choice}>
            <input
              type="radio"
              name={'recognition-' + topic.id}
              checked={answer === i}
              onChange={() => {
                setAnswer(i);
                setSubmitted(false);
              }}
            />
            {choice}
          </label>
        ))}
      </fieldset>
      <Button
        disabled={answer === null}
        onClick={() => {
          setSubmitted(true);
          update((old) => ({ ...old, recognition: { ...old.recognition, [topic.id]: answer === question.correctIndex } }));
        }}
      >
        Check recognition
      </Button>
      {submitted && (
        <p role="status">
          {answer === question.correctIndex ? 'Correct.' : 'Review this concept.'} {question.explanation}
        </p>
      )}
    </section>
  );
}
