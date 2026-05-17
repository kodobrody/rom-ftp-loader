import { useAppBootstrap } from './hooks/useAppBootstrap'
import { AppView } from './views/AppView'

const App = (): React.JSX.Element => {
  useAppBootstrap()

  return <AppView />
}

export default App