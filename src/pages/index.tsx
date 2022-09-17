import { Container } from '../components/Container'
import {
  Flex
} from '@chakra-ui/react'
import { useColorMode, IconButton } from '@chakra-ui/react'
import HeroMain from '../components/hero/HeroMain'
import BioMain from '../components/bio/BioMain'
import WorkExperience from '../components/workExperience/WorkExperience'
import Skills from '../components/skills/Skills'
import Footer from '../components/footer/Footer'

const Index = () => (

  <Flex direction="column"
    alignItems="center"
    justifyContent="flex-start"
    transition="all 0.15s ease-out"
    width="100vw"
    overflowX={"hidden"}
    color="#fff"
    backgroundColor="#1a202b"
    fontSize={["1.25em", null, "1em"]}
  >
    <HeroMain />
    <BioMain />
    <WorkExperience />
    <Skills />
    <Footer />
  </Flex >
)

export default Index
