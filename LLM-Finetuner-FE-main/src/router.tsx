import { Suspense, lazy } from 'react';
import { Navigate } from 'react-router-dom';
import { RouteObject } from 'react-router';

import SidebarLayout from 'src/layouts/SidebarLayout';
import BaseLayout from 'src/layouts/BaseLayout';

import SuspenseLoader from 'src/components/SuspenseLoader';

const Loader = (Component) => (props) =>
  (
    <Suspense fallback={<SuspenseLoader />}>
      <Component {...props} />
    </Suspense>
  );

// Pages
const Talker = Loader(lazy(() => import('src/content/dashboards/Chat/Talker')));
const Test = Loader(lazy(() => import('src/content/dashboards/Chat/Test')));

// Dashboards
const TasksLLM = Loader(lazy(() => import('src/content/dashboards/LLM/Finetune')));
const AgentLLM = Loader(lazy(() => import('src/content/dashboards/LLM/TuneAgent')));

// Applications

const Transactions = Loader(
  lazy(() => import('src/content/dashboards/Transactions'))
);

const routes: RouteObject[] = [
  {
    path: '',
    element: <SidebarLayout />,
    children: [
      {
        path: '',
        element: <Navigate to="chat" replace />
      },
      {
        path: 'chat',
        element: <Talker />
      },
      {
        path: 'test',
        element: <Test />
      },
      // 1) Finetune + RAG
      {
        path: 'agent-llm',
        element: <AgentLLM mode="finetune-rag" key="finetune-rag-route" />
      },

      // 2) Finetune only
      {
        path: 'finetune-llm',
        element: <AgentLLM mode="finetune" key="finetune-route" />
      },

      // 3) RAG only
      {
        path: 'rag-llm',
        element: <AgentLLM mode="rag" key="rag-route" />
      },
  
      // 3) Business information only
      {
        path: 'prompt-llm',
        element: <AgentLLM mode="prompt" key="prompt-route" />
      },
      {
        path: 'task-llm',
        element: <TasksLLM />
      },
    ]
  },
  {
    path: 'management',
    element: <SidebarLayout />,
    children: [
      {
        path: '',
        element: <Navigate to="transactions" replace />
      },
      {
        path: 'transactions',
        element: <Transactions />
      },
      
    ]
  },
];

export default routes;
