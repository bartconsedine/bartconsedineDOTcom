import { Container } from '../components/Container'
import {
  Flex,
  Heading,
  Image
} from '@chakra-ui/react'

import HeroMain from '../components/hero/HeroMain'
import BioMain from '../components/bio/BioMain'
import WorkExperience from '../components/workExperience/WorkExperience'
import Skills from '../components/skills/Skills'

const Index = () => (
  <Container width="100vw" overflowX={"hidden"}>
    <HeroMain></HeroMain>
    <BioMain></BioMain>
    <WorkExperience></WorkExperience>
    <Skills></Skills>
  </Container>
)

export default Index
