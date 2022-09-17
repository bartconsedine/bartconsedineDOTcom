import {
    UnorderedList,
    ListItem,
    Heading,
    Flex,
    Box
} from '@chakra-ui/react'

import { Zoom, Fade } from "react-awesome-reveal"

const Skills = () => {

    const softwareSkills = [
        "Javascript",
        "React JS",
        "Ruby on Rails",
        "Ruby",
        "Angular JS",
        "Python",
        "HTML",
        "CSS",
        "SQL",
        "Node JS"

    ]

    const advertisingSkills = [
        "Google Search",
        "Google Adwords",
        "Facebook",
        "Instagram",
        "Taboola",
        "Outbrain",
        "Display Advertising",
        "Landing Page Optimization",
        "Creative Optimization",
        "Campaign Optimization"
    ]

    const miscSkills = [
        "Excel",
        "Data Modeling",
        "Graphic Design",
        "Client Services",

    ]

    const employers = [
        "Start-Ups",
        "Advertising Technoloogy",
        "Advertising Agencies",
        "Information Technology",
        "Entrepreneur"

    ]

    const columnStyles = {
        marginTop: "5em",
        width: ["80vw",null,"20vw"],
        direction: "column"
    }

    const headingStyles = {
        size: "xl",
        marginBottom: ".2em"
    }

    const showSkills = (i) => {
        return i.map(item => { return (<ListItem fontSize="2xl">{item}</ListItem>) })
    }

    return (
        <>
            <Zoom>
                <Box width='100vw' paddingLeft={["2em", null,"5em"]}>
                    <Heading color="#ade3b8" size="4xl">Skills</Heading>
                </Box>
            </Zoom>

            <Flex align-content="left" direction={["column",null,"row"]} width="100vw" padding={["2em",null,"2em 7em"]} justify="space-between">
                <Fade cascade damping={.2}>
                    <Flex {...columnStyles} >
                        <Heading {...headingStyles}>Software</Heading>
                        <UnorderedList>{showSkills(softwareSkills)}</UnorderedList>
                    </Flex>
                    <Flex {...columnStyles} >
                        <Heading {...headingStyles}>Advertising</Heading>
                        <UnorderedList>{showSkills(advertisingSkills)}</UnorderedList>
                    </Flex>
                    <Flex {...columnStyles} >
                        <Heading {...headingStyles}>Misc.</Heading>
                        <UnorderedList>{showSkills(miscSkills)}</UnorderedList>
                    </Flex>
                    <Flex {...columnStyles} >
                        <Heading {...headingStyles}>Employers</Heading>
                        <UnorderedList>{showSkills(employers)}</UnorderedList>
                    </Flex>
                </Fade>
            </Flex>


        </>
    )
}

export default Skills