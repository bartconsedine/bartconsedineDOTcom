import {
  Link as ChakraLink,
  Text,
  Code,
  List,
  ListIcon,
  ListItem,
} from '@chakra-ui/react'
import { CheckCircleIcon, LinkIcon } from '@chakra-ui/icons'

import { Hero } from '../components/Hero'
import { Container } from '../components/Container'
import { Main } from '../components/Main'
import { DarkModeSwitch } from '../components/DarkModeSwitch'
import { CTA } from '../components/CTA'
import { Footer } from '../components/Footer'
import HeroMain from '../components/hero/HeroMain'
import BioMain from '../components/bio/BioMain'

const Index = () => (
  <Container width="100vw" overflowX={"hidden"}>
    <HeroMain></HeroMain>
    <BioMain></BioMain>
  </Container>
)

export default Index
