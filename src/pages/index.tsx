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
import Footer from '../components/footer/Footer'

const Index = () => (
  <Container width="100vw" overflowX={"hidden"}>
    <HeroMain/>
    <BioMain/>
    <WorkExperience/>
    <Skills/>
    <Footer/>
  </Container>
)

export default Index
